// server/server.js
require('dotenv').config(); // Load environment variables first
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Import cookie-parser
const path = require('path'); // Needed for serving client build later

// --- Import Models ---
const ShoppingList = require('./models/ShoppingList');
const Item = require('./models/Item');
const User = require('./models/User'); // Import User model

// --- Import Auth Utilities & Middleware ---
const { generateToken, setTokenCookie, clearTokenCookie, verifyToken, COOKIE_NAME } = require('./utils/auth');
const { protect, adminProtect } = require('./middleware/authMiddleware'); // Import middleware
const bcrypt = require('bcryptjs'); // Import bcrypt

// --- Environment Variables ---
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CORS_ORIGIN;
const ADMIN_PIN_HASH = process.env.ADMIN_PIN ? bcrypt.hashSync(process.env.ADMIN_PIN, 10) : null; // Hash admin PIN on startup

// --- Basic Validation ---
if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in .env file.");
    process.exit(1);
}
if (!CLIENT_ORIGIN) {
    console.warn("WARN: CORS_ORIGIN is not defined in .env file. Allowing any origin (development only).");
}
// JWT_SECRET validation happens in auth.js

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
// Ensure CLIENT_ORIGIN in .env matches your frontend URL exactly
const corsOptions = {
    origin: CLIENT_ORIGIN || '*', // Allow specific origin or all in dev
    credentials: true, // IMPORTANT: Allow cookies for auth
};

// --- Middleware ---
// ** IMPORTANT: Apply CORS *very early*, before other middleware and routes **
app.use(cors(corsOptions));
// ** REMOVED: app.options('*', cors(corsOptions)); - Let the main cors middleware handle OPTIONS **

app.use(express.json()); // For parsing application/json
app.use(cookieParser()); // For parsing cookies


// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1); // Exit if DB connection fails
    });

// --- Socket.IO Setup ---
const io = new Server(server, {
    path: "/customsocketpath/", // Keep custom path if needed
    cors: corsOptions, // Apply CORS options to Socket.IO
});

// --- Socket.IO Authentication Middleware ---
io.use(async (socket, next) => {
    // Extract token from handshake cookies
    const token = socket.handshake.auth.token || socket.handshake.headers.cookie?.split('; ').find(row => row.startsWith(`${COOKIE_NAME}=`))?.split('=')[1];

    if (!token) {
        console.log('Socket connection denied: No token provided.');
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) {
            console.log('Socket connection denied: Invalid token.');
            return next(new Error('Authentication error: Invalid token'));
        }

        // Attach user to the socket request object for use in event handlers
        const user = await User.findById(decoded.id).select('username isAdmin _id').lean(); // Use lean for plain JS object
        if (!user) {
             console.log('Socket connection denied: User not found for token.');
             return next(new Error('Authentication error: User not found'));
        }
        socket.request.user = user; // Attach user data
        // console.log(`Socket authenticated for user: ${user.username} (ID: ${user._id})`); // Reduce logging noise
        next();
    } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication error: Token verification failed'));
    }
});


// ========== API Routes ==========

// --- Authentication Routes ---
// Placed *after* CORS middleware
app.post('/api/auth/login', async (req, res) => {
    const { username, pin } = req.body;

    if (!username || !pin) {
        return res.status(400).json({ message: 'Please provide username and PIN' });
    }

    try {
        const user = await User.findOne({ username: username.toLowerCase() });

        if (user && (await user.comparePin(pin))) {
            // PIN is correct, generate token and set cookie
            const token = generateToken(user._id, user.username, user.isAdmin);
            setTokenCookie(res, token);

            // Send back user info (excluding hash)
            res.json({
                _id: user._id,
                username: user.username,
                isAdmin: user.isAdmin,
            });
        } else {
            res.status(401).json({ message: 'Invalid username or PIN' }); // Generic error
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    clearTokenCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/api/auth/session', protect, (req, res) => {
    // If protect middleware passes, user is authenticated
    res.json({
        _id: req.user._id,
        username: req.user.username,
        isAdmin: req.user.isAdmin,
    });
});

// --- Admin Panel PIN Check ---
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => {
    const { pin } = req.body;
    if (!ADMIN_PIN_HASH) {
        return res.status(500).json({ message: "Admin PIN not configured on server." });
    }
    if (!pin) {
        return res.status(400).json({ message: "PIN is required." });
    }

    const isMatch = await bcrypt.compare(pin, ADMIN_PIN_HASH);
    if (isMatch) {
        res.status(200).json({ message: "Admin PIN verified." });
    } else {
        res.status(401).json({ message: "Invalid Admin PIN." });
    }
});


// --- Shopping List Routes (Protected and permission-aware) ---
app.get('/api/lists', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const lists = await ShoppingList.find({
            $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ]
        }).populate('owner', 'username');
        res.json(lists);
    } catch (error) {
        console.error("Error fetching lists:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
});

app.get('/api/lists/:listId/items', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const listId = req.params.listId;

        if (!mongoose.Types.ObjectId.isValid(listId)) {
             return res.status(400).json({ message: 'Invalid list ID format' });
        }

        const list = await ShoppingList.findOne({
             _id: listId,
             $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ]
        });

        if (!list) {
            return res.status(404).json({ message: 'List not found or access denied' });
        }
        const items = await Item.find({ listId: listId });
        res.json(items);
    } catch (error) {
        console.error(`Error fetching items for list ${req.params.listId}:`, error);
        res.status(500).json({ message: 'Error fetching items' });
    }
});


// ========== Socket.IO Event Handlers (Permission-aware) ==========
io.on('connection', (socket) => {
    const user = socket.request.user;
    if(!user) {
        console.error("Socket connected without authenticated user!");
        socket.disconnect(true);
        return;
    }
    console.log(`User connected via socket: ${user.username} (ID: ${user._id}, Socket ID: ${socket.id})`);

    // Helper function to check list access within socket events
    const checkListAccess = async (listId) => {
        if (!mongoose.Types.ObjectId.isValid(listId)) return null;
        return await ShoppingList.findOne({
            _id: listId,
            $or: [ { owner: user._id }, { isPublic: true }, { allowedUsers: user._id } ]
        }).select('_id').lean(); // Use lean for performance
    };


    // --- List Events ---
    socket.on('addList', async (listName, callback) => {
        try {
            if (!listName || typeof listName !== 'string' || listName.trim().length === 0) {
                 return callback?.({ error: 'List name cannot be empty' });
            }
            // Owner is automatically the connected user
            const newList = new ShoppingList({ name: listName.trim(), owner: user._id });
            await newList.save();
            console.log(`List '${newList.name}' added by user ${user.username}`);
            io.emit('listsUpdated'); // Broadcast (Simplification - ideally target specific users)
            callback?.({ success: true, list: newList });
        } catch (error) {
            console.error(`Error adding list for user ${user.username}:`, error);
            callback?.({ error: 'Failed to add list: ' + error.message });
        }
    });

     socket.on('deleteList', async (listId, callback) => {
        try {
             if (!mongoose.Types.ObjectId.isValid(listId)) { return callback?.({ error: 'Invalid list ID' }); }
             const list = await ShoppingList.findById(listId);
             if (!list) { return callback?.({ error: 'List not found' }); }
             // --- Owner Check ---
             if (!list.owner.equals(user._id)) {
                 console.warn(`User ${user.username} attempted delete list ${listId} owned by ${list.owner}`);
                 return callback?.({ error: 'Permission denied' });
             }

             await Item.deleteMany({ listId: list._id });
             await ShoppingList.findByIdAndDelete(listId);
             console.log(`List '${list.name}' deleted by owner ${user.username}`);
             io.emit('listDeleted', listId); // Broadcast
             callback?.({ success: true });
        } catch (error) {
             console.error(`Error deleting list ${listId} for user ${user.username}:`, error);
             callback?.({ error: 'Failed to delete list: ' + error.message });
        }
     });

    // --- Item Events ---
    socket.on('addItem', async ({ listId, itemName }, callback) => {
         try {
             if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) { return callback?.({ error: 'Item name empty' }); }
             const list = await checkListAccess(listId); // Use helper
             if (!list) { return callback?.({ error: 'List not found or access denied' }); }

             const newItem = new Item({ name: itemName.trim(), listId: listId });
             await newItem.save();
             console.log(`Item '${newItem.name}' added to list ${listId} by ${user.username}`);
             io.to(listId).emit('itemAdded', { ...newItem.toObject(), listId: listId });
             callback?.({ success: true, item: newItem });
         } catch (error) {
             console.error(`Error adding item to list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to add item: ' + error.message });
         }
    });

     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID' }); }
             const list = await checkListAccess(listId); // Use helper
             if (!list) { return callback?.({ error: 'List not found or access denied' }); }

             const item = await Item.findById(itemId);
             if (!item || !item.listId.equals(listId)) { return callback?.({ error: 'Item not found in this list' }); }

             item.completed = !item.completed;
             await item.save();
             console.log(`Item '${item.name}' toggled in list ${listId} by ${user.username}`);
             io.to(listId).emit('itemUpdated', { ...item.toObject(), listId: listId });
             callback?.({ success: true, item: item });
         } catch (error) {
             console.error(`Error toggling item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to toggle item: ' + error.message });
         }
     });

     socket.on('deleteItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID' }); }
             const list = await checkListAccess(listId); // Use helper
             if (!list) { return callback?.({ error: 'List not found or access denied' }); }

             const item = await Item.findOneAndDelete({ _id: itemId, listId: listId });
             if (!item) { return callback?.({ error: 'Item not found or already deleted' }); }

             console.log(`Item '${item.name}' deleted from list ${listId} by ${user.username}`);
             io.to(listId).emit('itemDeleted', itemId);
             callback?.({ success: true, itemId: itemId });
         } catch (error) {
             console.error(`Error deleting item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to delete item: ' + error.message });
         }
     });


    // --- Room Management ---
    socket.on('joinList', async (listId) => {
         const list = await checkListAccess(listId); // Verify access before joining
         if(list) {
            console.log(`User ${user.username} joining room for list: ${listId}`);
            socket.join(listId);
         } else {
             console.warn(`User ${user.username} denied joining room for list ${listId} (no access).`)
         }
    });

    socket.on('leaveList', (listId) => {
        // No need to check permissions for leaving
        console.log(`User ${user.username} leaving room for list: ${listId}`);
        socket.leave(listId);
    });


    // --- Disconnect ---
    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${user.username} (Socket ID: ${socket.id}). Reason: ${reason}`);
    });
});


// --- Serve Frontend ---
if (process.env.NODE_ENV === 'production') {
     const clientBuildPath = path.resolve(__dirname, '../client/dist');
     console.log(`Serving static files from: ${clientBuildPath}`);
     app.use(express.static(clientBuildPath));
     app.get('*', (req, res) => {
         res.sendFile(path.resolve(clientBuildPath, 'index.html'));
     });
} else {
     app.get('/', (req, res) => { res.send("API is running in development mode..."); });
}

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Client expected at: ${CLIENT_ORIGIN || 'http://localhost:5173'}`);
     if(!ADMIN_PIN_HASH) {
          console.warn('\x1b[33m%s\x1b[0m', 'WARN: ADMIN_PIN is not set in .env. Admin panel verification will not work.');
     }
});