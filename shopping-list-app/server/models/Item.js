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
    }
}, { timestamps: true });

// // Optional: Compound index if often querying by listId and completed status
// itemSchema.index({ listId: 1, completed: 1 });

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;