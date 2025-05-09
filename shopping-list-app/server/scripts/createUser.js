// server/scripts/createUser.js
const path = require('path');
// Load .env file from the main server directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User'); // Adjust path if your models folder is elsewhere

// --- Configuration & Validation ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: MONGODB_URI is not defined in the .env file.'); // Red color for error
    process.exit(1);
}

// Get username and pin from command line arguments
const usernameArg = process.argv[2];
const pinArg = process.argv[3];

// Basic argument validation
if (!usernameArg || !pinArg) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: Missing arguments.');
    console.log('Usage: node scripts/createUser.js <username> <4-digit-pin>');
    process.exit(1);
}

// Validate username length/format minimally here (more strict validation in model)
if (usernameArg.length < 3 || usernameArg.length > 30) {
     console.error('\x1b[31m%s\x1b[0m', 'Error: Username must be between 3 and 30 characters.');
     process.exit(1);
}

// Validate PIN format
if (!/^\d{4}$/.test(pinArg)) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: Invalid PIN format. Must be exactly 4 digits.');
    process.exit(1);
}

// --- Main Async Function ---
async function createUser() {
    let connection; // Keep track of connection
    try {
        console.log('\x1b[34m%s\x1b[0m', 'Connecting to MongoDB...'); // Blue color
        connection = await mongoose.connect(MONGODB_URI);
        console.log('\x1b[32m%s\x1b[0m', 'MongoDB Connected.'); // Green color

        const lowerCaseUsername = usernameArg.toLowerCase();

        // 1. Check if user already exists
        console.log(`Checking for existing user "${lowerCaseUsername}"...`);
        const existingUser = await User.findOne({ username: lowerCaseUsername });

        if (existingUser) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Username "${lowerCaseUsername}" already exists.`);
            process.exitCode = 1; // Set error exit code
            return; // Exit the function early
        }

        // 2. Hash the PIN (using the static method from the model)
        console.log('Hashing PIN...');
        let hashedPin;
        try {
            hashedPin = await User.hashPin(pinArg);
        } catch (hashError) {
             // Catch specific PIN validation errors from the hashPin method
            console.error('\x1b[31m%s\x1b[0m', `Error hashing PIN: ${hashError.message}`);
             process.exitCode = 1;
             return;
        }


        // 3. Create and save the new user
        console.log(`Creating user "${lowerCaseUsername}"...`);
        const newUser = new User({
            username: lowerCaseUsername,
            hashedPin: hashedPin,
            // You could add an optional 4th argument to set isAdmin: true if needed
            // isAdmin: process.argv[4] === '--admin'
        });

        await newUser.save();
        console.log('\x1b[32m%s\x1b[0m', `User "${newUser.username}" created successfully! (ID: ${newUser._id})`); // Green color

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Error during user creation process:'); // Red color
        console.error(error);
        process.exitCode = 1; // Indicate failure
    } finally {
        // 4. Disconnect from MongoDB
        if (connection) {
            console.log('\x1b[34m%s\x1b[0m', 'Disconnecting from MongoDB...'); // Blue color
            await mongoose.disconnect();
            console.log('MongoDB Disconnected.');
        }
        // Exit with the appropriate code (0 for success, 1 for error)
        process.exit();
    }
}

// --- Run the Script ---
createUser();