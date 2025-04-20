// server/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const ShoppingList = require('./models/ShoppingList');
const Item = require('./models/Item');

console.log('>>> Item Model (after import):', typeof Item, Item);

const app = express();
const server = http.createServer(app);

const allowedOrigins = [process.env.CLIENT_URL]; // Get client URL from .env
console.log(`Allowing origins: ${allowedOrigins}`);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Allow requests only from your frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors({ origin: allowedOrigins })); // Use CORS middleware
app.use(express.json()); // To parse JSON request bodies

// --- Database Connection ---
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// --- Basic API Routes (Optional - Good for initial fetch) ---
app.get('/api/lists', async (req, res) => {
  try {
    const lists = await ShoppingList.find().sort({ createdAt: -1 });
    res.json(lists);
  } catch (err) {
    console.error("Error fetching lists:", err);
    res.status(500).json({ message: 'Error fetching lists' });
  }
});

app.get('/api/lists/:listId/items', async (req, res) => {
    try {
        const items = await Item.find({ listId: req.params.listId }).sort({ createdAt: 1 });
        res.json(items);
    } catch (err) {
        console.error(`Error fetching items for list ${req.params.listId}:`, err);
        res.status(500).json({ message: 'Error fetching items' });
    }
});


// --- Socket.IO Real-time Logic ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room specific to a shopping list
  socket.on('joinList', (listId) => {
    socket.join(listId);
    console.log(`User ${socket.id} joined list room: ${listId}`);
    // Optionally send current list items when user joins
    // Item.find({ listId: listId }).sort({ createdAt: 1 })
    //   .then(items => socket.emit('listItems', items)) // Send only to the joining client
    //   .catch(err => console.error("Error sending initial items:", err));
  });

  // Leave a room when navigating away (client should handle this)
  socket.on('leaveList', (listId) => {
     socket.leave(listId);
     console.log(`User ${socket.id} left list room: ${listId}`);
  });

  // --- List Operations ---
  socket.on('addList', async (listName, callback) => {
    try {
      const newList = new ShoppingList({ name: listName || 'New Shopping List' });
      const savedList = await newList.save();
      io.emit('listsUpdated'); // Notify ALL clients a list was added/removed
      if (callback) callback(savedList); // Send back the created list ID/data if needed
      console.log("List Added:", savedList.name);
    } catch (err) {
      console.error("Error adding list:", err);
       if (callback) callback({ error: "Error adding list" });
    }
  });

  socket.on('deleteList', async (listId, callback) => {
    try {
      // Also delete all items associated with this list
      await Item.deleteMany({ listId: listId });
      const deletedList = await ShoppingList.findByIdAndDelete(listId);
      if (!deletedList) {
         if (callback) callback({ error: "List not found" });
         return;
      }
      io.emit('listsUpdated'); // Notify ALL clients
      io.to(listId).emit('listDeleted'); // Notify clients viewing this specific list it's gone
      if (callback) callback({ success: true });
      console.log("List Deleted:", listId);
    } catch (err) {
      console.error("Error deleting list:", err);
       if (callback) callback({ error: "Error deleting list" });
    }
  });

 // --- Item Operations ---
  socket.on('addItem', async ({ listId, itemName }, callback) => {
      if (!listId || !itemName) {
          return callback ? callback({ error: "Missing list ID or item name" }) : null;
      }
      try {
          console.log('>>> Item Model (inside handler):', typeof Item, Item);
          const newItem = new Item({ name: itemName, listId: listId });
          const savedItem = await newItem.save();
          // Notify only clients in the specific list room
          io.to(listId).emit('itemAdded', savedItem);
          console.log(`Item Added to ${listId}:`, savedItem.name);
          if (callback) callback(savedItem);
      } catch (err) {
          console.error("Error adding item:", err);
          if (callback) callback({ error: "Error adding item" });
      }
  });

  socket.on('toggleItem', async ({ listId, itemId }, callback) => {
     try {
         const item = await Item.findById(itemId);
         if (!item) {
             return callback ? callback({ error: "Item not found" }) : null;
         }
         item.completed = !item.completed;
         const updatedItem = await item.save();
         // Notify only clients in the specific list room
         io.to(listId).emit('itemUpdated', updatedItem);
         console.log(`Item Toggled in ${listId}:`, updatedItem.name, updatedItem.completed);
         if (callback) callback(updatedItem);
     } catch (err) {
         console.error("Error toggling item:", err);
         if (callback) callback({ error: "Error toggling item" });
     }
  });

   socket.on('deleteItem', async ({ listId, itemId }, callback) => {
     try {
         const deletedItem = await Item.findByIdAndDelete(itemId);
         if (!deletedItem) {
             return callback ? callback({ error: "Item not found" }) : null;
         }
         // Notify only clients in the specific list room
         io.to(listId).emit('itemDeleted', itemId); // Send the ID of the deleted item
         console.log(`Item Deleted from ${listId}:`, itemId);
         if (callback) callback({ success: true, deletedItemId: itemId });
     } catch (err) {
         console.error("Error deleting item:", err);
         if (callback) callback({ error: "Error deleting item" });
     }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // No need to manually leave rooms, Socket.IO handles this on disconnect
  });
});

// --- Start Server ---
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));