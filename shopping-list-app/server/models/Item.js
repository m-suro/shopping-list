// server/models/Item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Item name is required'],
        trim: true
    },
    completed: {
        type: Boolean,
        default: false
    },
    listId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ShoppingList',
        required: true,
        index: true // Index for faster lookups by listId
    },
    comment: {
        type: String,
        trim: true,
        maxLength: [500, 'Comment cannot exceed 500 characters'],
        default: ''
    },
    // --- NEW QUANTITY FIELDS ---
    quantityValue: {
        type: Number,
        // Optional: Add validation like min value if needed
        // min: [0, 'Quantity cannot be negative'],
        default: null // Use null to indicate quantity not set
    },
    quantityUnit: {
        type: String,
        trim: true,
        maxLength: [50, 'Quantity unit cannot exceed 50 characters'], // Optional max length
        default: '' // Default to empty string
    }
    // --- END NEW QUANTITY FIELDS ---
}, { timestamps: true });

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;