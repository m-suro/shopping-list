// server/models/Item.js
const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  listId: { // Reference to the parent list
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShoppingList',
    required: true
  }
}, { timestamps: true }); // Add createdAt/updatedAt timestamps

module.exports = mongoose.model('Item', ItemSchema);