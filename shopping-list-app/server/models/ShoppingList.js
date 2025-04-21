// server/models/ShoppingList.js
const mongoose = require('mongoose');

const shoppingListSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'List name is required'],
        trim: true,
        default: 'New Shopping List'
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for faster lookups by owner
    },
    isPublic: {
        type: Boolean,
        default: false, // Default to private
        index: true // Index for faster lookups of public lists
    },
    allowedUsers: [{ // Users explicitly invited to a private list
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true // Index for faster lookups involving shared lists
    }]
}, { timestamps: true }); // Add timestamps

// Ensure a user cannot be both owner and in allowedUsers (though logic should prevent this)
// This is more complex to validate directly in schema, handle in application logic.

const ShoppingList = mongoose.model('ShoppingList', shoppingListSchema);

module.exports = ShoppingList;