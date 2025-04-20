// server/models/ShoppingList.js
const mongoose = require('mongoose');

const ShoppingListSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'New Shopping List'
  },
  // We don't store items directly embedded here for easier updates/scaling
  // Items will reference this list via listId
}, { timestamps: true });

module.exports = mongoose.model('ShoppingList', ShoppingListSchema);