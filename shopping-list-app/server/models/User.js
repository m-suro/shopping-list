// server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true, // Index for faster lookups
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    // Basic validation for username format (alphanumeric + underscore/hyphen)
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens']
  },
  // Store the hashed PIN, never the plain text PIN
  hashedPin: {
    type: String,
    required: [true, 'PIN is required'] // Hashed PIN is required
  },
  isAdmin: { // Flag for admin users
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// --- PIN Hashing ---
// Method to hash a PIN before saving (or updating)
userSchema.statics.hashPin = async function(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error('Invalid PIN format. Must be 4 digits.');
  }
  const salt = await bcrypt.genSalt(10); // Salt rounds
  return await bcrypt.hash(pin, salt);
};

// --- PIN Comparison ---
// Instance method to compare a candidate PIN with the stored hash
userSchema.methods.comparePin = async function(candidatePin) {
  return await bcrypt.compare(candidatePin, this.hashedPin);
};


const User = mongoose.model('User', userSchema);

module.exports = User;