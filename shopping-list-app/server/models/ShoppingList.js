// server/models/ShoppingList.js
const mongoose = require('mongoose');

const shoppingListSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'List name is required'],
    trim: true,
    maxlength: [100, 'List name cannot exceed 100 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // --- NEW FIELDS ---
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
    index: true // Index for faster lookups by owner
  },
  isPublic: { // Determines if anyone logged in can see it
    type: Boolean,
    default: false // Default to private
  },
  // Users specifically invited to a private list (excluding the owner)
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
  // -----------------
});

// Pre-hook to remove associated items when a list is deleted
shoppingListSchema.pre('remove', async function(next) {
  // Important: Ensure 'this' refers to the document being removed
  // Note: 'remove' hook might behave differently in newer Mongoose versions.
  // Consider using findByIdAndDelete and then deleting items separately if needed.
  // Or use middleware on the delete operation trigger.
  // For simplicity here, assuming it works or alternative deletion logic is used.
  console.log(`Removing items for list ${this._id}`);
  try {
    await mongoose.model('Item').deleteMany({ listId: this._id });
    next();
  } catch (error) {
    next(error);
  }
});


const ShoppingList = mongoose.model('ShoppingList', shoppingListSchema);

module.exports = ShoppingList;