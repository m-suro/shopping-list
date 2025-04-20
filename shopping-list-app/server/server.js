// server/server.js

// --- Imports ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
// *** Ensure this matches your actual model filename ***
const List = require('./models/ShoppingList'); // Using ShoppingList.js as requested
const Item = require('./models/Item');

dotenv.config();

// --- App and Server Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const clientPort = 5173;
const serverPort = process.env.PORT || 3001; // Use the actual server port
const codespaceName = process.env.CODESPACE_NAME;
const codespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

// Construct potential URLs
const potentialClientOrigin = codespaceName && codespaceDomain ? `https://${codespaceName}-${clientPort}.${codespaceDomain}` : null;
const potentialClientOriginApp = codespaceName && codespaceDomain ? `https://${codespaceName}-${clientPort}.app.${codespaceDomain}` : null;
const actualServerPublicUrl = codespaceName && codespaceDomain ? `https://${codespaceName}-${serverPort}.${codespaceDomain}` : null;

const allowedOrigins = [
    'http://localhost:5173', // Local dev
    // Explicitly add the origin the browser reported errors from
    'https://humble-lamp-g446w4v9v7j4h9p7p-5173.app.github.dev',
    // Add the other potential variant just in case
    'https://humble-lamp-g446w4v9v7j4h9p7p-5173.github.dev',
];

// Add dynamically generated *client* URLs if valid and not already present
if (potentialClientOrigin && !allowedOrigins.includes(potentialClientOrigin)) {
    allowedOrigins.push(potentialClientOrigin);
}
if (potentialClientOriginApp && !allowedOrigins.includes(potentialClientOriginApp)) {
    allowedOrigins.push(potentialClientOriginApp);
}

console.log("--- CORS Configuration ---");
console.log("Allowed Client Origins:", allowedOrigins);
console.log("-------------------------");

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            console.log(`CORS check PASSED for origin: ${origin || 'undefined'}`);
            callback(null, true);
        } else {
            console.error(`CORS check FAILED for origin: ${origin}`);
            console.error(`-> Origin not in allowed list: [${allowedOrigins.join(', ')}]`);
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true
};

app.use(cors(corsOptions));

// Initialize Socket.IO Server *with* the same CORS options and custom path
const io = new Server(server, {
    cors: corsOptions,
    // *** ADD CUSTOM PATH ***
    path: "/customsocketpath/" // Use a distinct path, ensure trailing slash
});

// --- Express Middleware ---
app.use(express.json());

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- API Routes ---
app.get('/api/lists', async (req, res, next) => {
    try {
        const lists = await List.find().sort({ createdAt: -1 });
        res.json(lists);
    } catch (err) {
        console.error("Error fetching lists:", err.message); // Log error message
        next(err);
    }
});
app.get('/api/lists/:listId/items', async (req, res, next) => {
    try {
         if (!mongoose.Types.ObjectId.isValid(req.params.listId)) {
             return res.status(400).json({ message: 'Invalid List ID format' });
         }
        const items = await Item.find({ listId: req.params.listId });
        res.json(items);
    } catch (err) {
        console.error(`Error fetching items for list ${req.params.listId}:`, err.message); // Log error message
        next(err);
    }
});

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
    // Use optional chaining in case transport is momentarily undefined during connection setup
    console.log(`Socket connected: ${socket.id} using transport: ${socket.conn?.transport?.name} on path: ${socket.nsp.name}`);

    socket.on('joinList', (listId) => {
        if (!listId || typeof listId !== 'string') {
             console.warn(`Invalid listId received for joinList from ${socket.id}:`, listId);
             return;
        }
        console.log(`Socket ${socket.id} joining list room: ${listId}`);
        socket.join(listId);
    });

    socket.on('leaveList', (listId) => {
         if (!listId || typeof listId !== 'string') {
             console.warn(`Invalid listId received for leaveList from ${socket.id}:`, listId);
             return;
         }
        console.log(`Socket ${socket.id} leaving list room: ${listId}`);
        socket.leave(listId);
    });

    socket.on('addList', async (listName, callback) => {
        try {
            const defaultName = 'New Shopping List';
            const nameToUse = (typeof listName === 'string' && listName.trim()) ? listName.trim() : defaultName;
            if (nameToUse.length > 100) { if (callback) callback({ error: 'List name too long' }); return; }
            const newList = new List({ name: nameToUse });
            const savedList = await newList.save();
            console.log("List added:", savedList.name, `(ID: ${savedList._id})`);
            io.emit('listsUpdated');
            if (callback) callback({ success: true, list: savedList });
        } catch (err) {
            console.error("Error in addList handler:", err.message); // Log error message
            if (callback) callback({ error: 'Server error: Failed to add list' });
        }
    });

    socket.on('deleteList', async (listId, callback) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(listId)) { if (callback) callback({ error: 'Invalid List ID' }); return; }
            const listDeletionResult = await List.findByIdAndDelete(listId);
            if (!listDeletionResult) {
                 console.log(`List ${listId} not found for deletion.`);
                 if (callback) callback({ error: 'List not found' });
                 io.emit('listsUpdated'); return;
            }
            const itemDeletionResult = await Item.deleteMany({ listId: listId });
            console.log(`List ${listId} deleted. Items deleted: ${itemDeletionResult.deletedCount}`);
            io.emit('listDeleted', listId);
            io.emit('listsUpdated');
            if (callback) callback({ success: true });
        } catch (err) {
            console.error(`Error deleting list ${listId}:`, err.message); // Log error message
            if (callback) callback({ error: 'Server error: Failed to delete list' });
        }
    });

    socket.on('addItem', async ({ listId, itemName }, callback) => {
        try {
             if (!mongoose.Types.ObjectId.isValid(listId) || typeof itemName !== 'string' || !itemName.trim()) { if (callback) callback({ error: 'Invalid input for adding item' }); return; }
             const trimmedName = itemName.trim();
             if (trimmedName.length > 200) { if (callback) callback({ error: 'Item name too long' }); return; }
             const listExists = await List.exists({ _id: listId });
             if (!listExists) { if (callback) callback({ error: 'List does not exist' }); return; }
            const newItem = new Item({ listId: listId, name: trimmedName });
            const savedItem = await newItem.save();
            console.log(`Item added to list ${listId}:`, savedItem.name, `(ID: ${savedItem._id})`);
            io.to(listId).emit('itemAdded', savedItem);
            if (callback) callback({ success: true, item: savedItem });
        } catch (err) {
            console.error(`Error adding item to list ${listId}:`, err.message); // Log error message
            if (callback) callback({ error: 'Server error: Failed to add item' });
        }
    });

    socket.on('toggleItem', async ({ listId, itemId }, callback) => {
        try {
             if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(itemId)) { if (callback) callback({ error: 'Invalid ID for toggling item' }); return; }
            const item = await Item.findOne({ _id: itemId, listId: listId });
            if (!item) { if (callback) callback({ error: 'Item not found in the specified list' }); return; }
            item.completed = !item.completed;
            const updatedItem = await item.save();
            console.log(`Item ${itemId} toggled in list ${listId}. Completed: ${updatedItem.completed}`);
            io.to(listId).emit('itemUpdated', updatedItem);
            if (callback) callback({ success: true, item: updatedItem });
        } catch (err) {
            console.error(`Error toggling item ${itemId} in list ${listId}:`, err.message); // Log error message
            if (callback) callback({ error: 'Server error: Failed to toggle item' });
        }
    });

    socket.on('deleteItem', async ({ listId, itemId }, callback) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(itemId)) { if (callback) callback({ error: 'Invalid ID for deleting item' }); return; }
            const item = await Item.findOneAndDelete({ _id: itemId, listId: listId });
            if (!item) {
                console.log(`Item ${itemId} not found for deletion in list ${listId}.`);
                if (callback) callback({ success: true, message: 'Item already deleted or not found' });
                return;
            }
            console.log(`Item ${itemId} deleted from list ${listId}.`);
            io.to(listId).emit('itemDeleted', itemId);
            if (callback) callback({ success: true });
        } catch (err) {
            console.error(`Error deleting item ${itemId} from list ${listId}:`, err.message); // Log error message
            if (callback) callback({ error: 'Server error: Failed to delete item' });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected: ${socket.id}. Reason: ${reason}`);
    });

    socket.on('error', (error) => {
        console.error(`Socket Error for ${socket.id}:`, error);
    });
});

// --- Server Listening ---
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
    const connectUrl = actualServerPublicUrl || process.env.VITE_SERVER_URL || `http://localhost:${PORT}`;
    console.log(`   Client should connect API/Socket to: ${connectUrl}`);
    console.log(`   Accepting connections from origins: ${allowedOrigins.join(', ')}`);
});

// --- Express Error Handling Middleware ---
app.use((err, req, res, next) => {
    console.error("Express Error Handler Caught:", err.stack || err.message || err);
    if (res.headersSent) { return next(err); }
    res.status(err.status || 500).json({
        message: err.message || 'An unexpected server error occurred.',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// --- Process-wide Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});