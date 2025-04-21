// server/server.js
// Description: Backend server using Express and Socket.IO. Handles API requests,
// WebSocket connections, authentication, database interactions (MongoDB/Mongoose),
// and real-time updates for the shopping list application.

require('dotenv').config(); // Load environment variables first
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cookie = require('cookie'); // <-- Import the cookie library

// --- Import Models ---
const ShoppingList = require('./models/ShoppingList');
const Item = require('./models/Item');
const User = require('./models/User');

// --- Import Auth Utilities & Middleware ---
const { generateToken, setTokenCookie, clearTokenCookie, verifyToken, COOKIE_NAME } = require('./utils/auth');
const { protect, adminProtect } = require('./middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// --- Environment Variables ---
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CORS_ORIGIN;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PIN_HASH = process.env.ADMIN_PIN ? bcrypt.hashSync(process.env.ADMIN_PIN, 10) : null;

// --- Basic Validation ---
if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in .env file.");
    process.exit(1);
}
if (!CLIENT_ORIGIN) {
    console.warn("WARN: CORS_ORIGIN is not defined in .env file. Allowing any origin (development only).");
}
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}
// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = {
    origin: CLIENT_ORIGIN || '*', // Allow configured origin or any for dev
    credentials: true,
};

// --- Middleware ---
app.use(cors(corsOptions));
app.use(express.json()); // Parse JSON bodies
app.use(cookieParser()); // Parse cookies


// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1); // Exit if DB connection fails
    });

// --- Socket.IO Setup ---
const io = new Server(server, {
    cors: corsOptions,
    // Optional: configure transports, ping interval/timeout if needed
    // transports: ['websocket', 'polling'],
    // pingInterval: 10000,
    // pingTimeout: 5000,
});

// --- Socket.IO Authentication Middleware ---
// Verifies user token from cookies or auth payload before establishing connection.
io.use(async (socket, next) => {
    let token = null;
    const cookies = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie) : {};
    token = cookies[COOKIE_NAME]; // Prefer cookie

    // Fallback to auth payload (might be used by some clients)
    if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
    }

    if (!token) {
        console.log(`Socket connection denied (Socket ID: ${socket.id}): No token provided.`);
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = verifyToken(token); // Verify JWT
        if (!decoded || !decoded.id) {
            console.log(`Socket connection denied (Socket ID: ${socket.id}): Invalid token payload.`);
            return next(new Error('Authentication error: Invalid token'));
        }

        // Fetch user details (lean for performance)
        const user = await User.findById(decoded.id).select('username isAdmin _id').lean();
        if (!user) {
             console.log(`Socket connection denied (Socket ID: ${socket.id}): User not found for token.`);
             return next(new Error('Authentication error: User not found'));
        }

        // Attach user object to the socket request for use in event handlers
        socket.request.user = user;
        // console.log(`Socket authenticated for user: ${user.username} (ID: ${user._id}, Socket ID: ${socket.id})`);
        next(); // Allow connection
    } catch (error) {
        console.error(`Socket authentication error (Socket ID: ${socket.id}):`, error.name, error.message);
         // Handle specific JWT errors
         if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             next(new Error('Authentication error: Invalid or expired token'));
         } else {
             // Handle other server errors during verification
             next(new Error('Authentication error: Server error during verification'));
         }
    }
});


// ========== API Routes ==========

// --- Authentication Routes ---
app.post('/api/auth/login', async (req, res) => {
    const { username, pin } = req.body;

    if (!username || !pin) {
        return res.status(400).json({ message: 'Please provide username and PIN' });
    }

    try {
        const user = await User.findOne({ username: username.toLowerCase() });

        if (user && (await user.comparePin(pin))) {
            // Generate token and set cookie
            const token = generateToken(user._id, user.username, user.isAdmin);
            setTokenCookie(res, token);

            // Return user details (excluding sensitive info)
            res.json({
                _id: user._id,
                username: user.username,
                isAdmin: user.isAdmin,
            });
        } else {
            res.status(401).json({ message: 'Invalid username or PIN' });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    clearTokenCookie(res); // Clear the authentication cookie
    res.status(200).json({ message: 'Logged out successfully' });
});

// Session check endpoint - uses `protect` middleware to verify token
app.get('/api/auth/session', protect, (req, res) => {
    // If middleware passes, req.user is populated
    res.json({
        _id: req.user._id,
        username: req.user.username,
        isAdmin: req.user.isAdmin,
    });
});

// --- Admin Panel PIN Check ---
// Uses `protect` and `adminProtect` middleware
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => {
    const { pin } = req.body;
    if (!ADMIN_PIN_HASH) { // Check if admin PIN is configured
        return res.status(500).json({ message: "Admin PIN not configured on server." });
    }
    if (!pin) {
        return res.status(400).json({ message: "PIN is required." });
    }

    try {
        const isMatch = await bcrypt.compare(pin, ADMIN_PIN_HASH); // Compare provided PIN with stored hash
        if (isMatch) {
            res.status(200).json({ message: "Admin PIN verified." });
        } else {
            res.status(401).json({ message: "Invalid Admin PIN." });
        }
    } catch (error) {
         console.error("Admin PIN check error:", error);
         res.status(500).json({ message: 'Server error verifying admin PIN' });
    }
});

// --- User Search Route (for sharing autocomplete) ---
// Uses `protect` middleware
app.get('/api/users/search', protect, async (req, res) => {
    const query = req.query.q || ''; // Get search query from query params
    const currentUserId = req.user._id; // Exclude current user from results

    if (!query) {
        return res.json([]); // Return empty array if no query
    }

    try {
        // Find users matching query, excluding self, limit results
        const users = await User.find({
            username: { $regex: `^${query}`, $options: 'i' }, // Case-insensitive prefix search
            _id: { $ne: currentUserId } // Exclude current user
        })
        .select('username _id') // Only return necessary fields
        .limit(10) // Limit results for performance
        .lean(); // Use lean for performance

        res.json(users);
    } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ message: "Error searching users" });
    }
});


// --- Shopping List Routes (Protected and permission-aware) ---

// **MODIFIED**: Fetch lists AND their items
// Uses `protect` middleware
app.get('/api/lists', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        // Find lists user has access to (owner, public, or allowed)
        const lists = await ShoppingList.find({
            $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ]
        })
        .populate('owner', 'username _id')       // Populate owner details
        .populate('allowedUsers', 'username _id') // Populate allowed user details
        .sort({ name: 1 }) // Sort lists alphabetically by name
        .lean(); // Use lean for performance

        // Manually populate items for each accessible list concurrently
        const listsWithItems = await Promise.all(lists.map(async (list) => {
            const items = await Item.find({ listId: list._id }).sort({ createdAt: 1 }).lean(); // Fetch and sort items
            return { ...list, items: items }; // Combine list data with its items
        }));

        res.json(listsWithItems); // Send the enriched list data
    } catch (error) {
        console.error("Error fetching lists:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
});

// **NOTE**: Kept for potentially fetching only items for a specific list if needed later.
// Uses `protect` middleware
app.get('/api/lists/:listId/items', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const listId = req.params.listId;

        // Validate listId format
        if (!mongoose.Types.ObjectId.isValid(listId)) {
             return res.status(400).json({ message: 'Invalid list ID format' });
        }

        // Verify user has access to the list
        const list = await ShoppingList.findOne({
             _id: listId,
             $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ]
        }).select('_id'); // Only need to check existence and access

        if (!list) {
            return res.status(403).json({ message: 'List not found or access denied' });
        }

        // Fetch items for the verified list
        const items = await Item.find({ listId: listId }).sort({ createdAt: 1 });
        res.json(items);
    } catch (error) {
        console.error(`Error fetching items for list ${req.params.listId}:`, error);
        res.status(500).json({ message: 'Error fetching items' });
    }
});


// ========== Socket.IO Event Handlers (Permission-aware) ==========
io.on('connection', (socket) => {
    const user = socket.request.user; // User object attached by auth middleware
    if(!user) {
        // This shouldn't happen if middleware is correct, but acts as a safeguard
        console.error("Socket connected without authenticated user object! Disconnecting.");
        socket.disconnect(true); // Force disconnect
        return;
    }
    console.log(`User connected: ${user.username} (Socket ID: ${socket.id})`);

    // --- Helper: Check List Access ---
    // Checks if the current user (from socket) can access a given list.
    const checkListAccess = async (listId, projection = '_id owner isPublic allowedUsers') => {
         if (!mongoose.Types.ObjectId.isValid(listId)) {
            console.warn(`Invalid list ID format received from ${user.username}: ${listId}`);
            return null;
        }
        try {
            return await ShoppingList.findOne({
                _id: listId,
                $or: [ { owner: user._id }, { isPublic: true }, { allowedUsers: user._id } ]
            }).select(projection).lean();
        } catch (error) {
             console.error(`Database error checking access for user ${user.username} on list ${listId}:`, error);
             return null;
        }
    };

     // --- Helper: Check List Ownership ---
     // Checks if the current user (from socket) is the owner of the list.
    const checkListOwnership = async (listId) => {
         if (!mongoose.Types.ObjectId.isValid(listId)) return null;
         try {
             return await ShoppingList.findOne({ _id: listId, owner: user._id }).select('_id').lean();
         } catch (error) {
             console.error(`Database error checking ownership for user ${user.username} on list ${listId}:`, error);
             return null;
         }
     };

     // --- Helper: Emit List Update To Relevant Users ---
     // Fetches the full list data (incl. items) and emits 'listsUpdated' event.
     const emitListUpdate = async (listId) => {
         try {
             // Fetch the list with populated details AND items
             const updatedList = await ShoppingList.findById(listId)
                 .populate('owner', 'username _id')
                 .populate('allowedUsers', 'username _id')
                 .populate('items') // Populate items directly
                 .lean();

             if (!updatedList) {
                 console.warn(`Attempted to emit update for non-existent list ${listId}`);
                 return;
             }
             const listIdStr = listId.toString();

             // Emit to the list-specific room (all connected viewers)
             console.log(`Emitting listsUpdated to room: ${listIdStr}`);
             io.to(listIdStr).emit('listsUpdated', updatedList);

             // If list isn't public, also emit individually to owner & allowed users
             // This ensures users not currently viewing the list get updates in their main list view.
             if (!updatedList.isPublic) {
                 const ownerIdStr = updatedList.owner._id.toString();
                 console.log(`Emitting listsUpdated to owner: ${ownerIdStr}`);
                 io.to(ownerIdStr).emit('listsUpdated', updatedList);

                 updatedList.allowedUsers.forEach(allowedUser => {
                     const allowedUserIdStr = allowedUser._id.toString();
                      // Avoid emitting to owner twice if they are the only one allowed
                     if (allowedUserIdStr !== ownerIdStr) {
                        console.log(`Emitting listsUpdated to allowed user: ${allowedUserIdStr}`);
                        io.to(allowedUserIdStr).emit('listsUpdated', updatedList);
                     }
                 });
             }

         } catch (error) {
             console.error(`Error fetching/emitting update for list ${listId}:`, error);
         }
     };


    // --- List Events ---
    socket.on('addList', async ({ name, isPublic }, callback) => {
        try {
            // Basic validation
            if (!name || typeof name !== 'string' || name.trim().length === 0) return callback?.({ error: 'List name cannot be empty', code: 'INVALID_NAME' });
            if (name.length > 100) return callback?.({ error: 'List name too long (max 100)', code: 'NAME_TOO_LONG' });

            // Create and save the new list
            const newList = new ShoppingList({
                name: name.trim(),
                owner: user._id, // Set owner from authenticated socket user
                isPublic: !!isPublic,
                allowedUsers: []
            });
            await newList.save();

            // Fetch the created list with owner populated (items will be empty)
            const populatedList = await ShoppingList.findById(newList._id)
                .populate('owner', 'username _id')
                .lean();

            populatedList.items = []; // Ensure items array exists for consistency

            const listIdStr = populatedList._id.toString();
            console.log(`List '${populatedList.name}' (ID: ${listIdStr}) added by user ${user.username}`);

            // Emit only to the creator initially via socket event
            socket.emit('listsUpdated', populatedList);
            // Have the creator join the room for this new list
            socket.join(listIdStr);

            // Send back the full list object in the callback for client sync mapping
            callback?.({ success: true, newList: populatedList });
        } catch (error) {
            console.error(`Error adding list for user ${user.username}:`, error);
            callback?.({ error: 'Failed to add list: ' + error.message, code: 'DB_ERROR' });
        }
    });

     socket.on('deleteList', async (listId, callback) => {
        try {
             // Verify ownership before deleting
             const list = await checkListOwnership(listId);
             if (!list) {
                  console.warn(`User ${user.username} attempted delete on list ${listId} they don't own or doesn't exist.`);
                  return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' });
             }
             const listIdStr = listId.toString();

             // Delete associated items first
             await Item.deleteMany({ listId: listId });
             // Then delete the list itself
             await ShoppingList.findByIdAndDelete(listId);
             console.log(`List ${listIdStr} deleted by owner ${user.username}`);

             // Notify everyone who *might* have had access that it's gone
             // Emitting broadly ensures clients remove it from their list view.
             io.emit('listDeleted', listIdStr); // Use string ID

             callback?.({ success: true });
        } catch (error) {
             console.error(`Error deleting list ${listId} for user ${user.username}:`, error);
             callback?.({ error: 'Failed to delete list: ' + error.message, code: 'DB_ERROR' });
        }
     });

     // --- List Privacy & Sharing Events (Owner only) ---
     socket.on('toggleListPrivacy', async (listId, callback) => {
         try {
             // Find the list document and ensure ownership
             const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
             if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }

             list.isPublic = !list.isPublic; // Toggle privacy
             await list.save(); // Save the change
             const listIdStr = listId.toString();
             console.log(`List ${listIdStr} privacy toggled to ${list.isPublic ? 'public' : 'private'} by owner ${user.username}`);

             // Emit the full updated list (including items) to relevant users
             await emitListUpdate(listId);

             callback?.({ success: true, isPublic: list.isPublic });
         } catch (error) {
             console.error(`Error toggling privacy for list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to update privacy: ' + error.message, code: 'DB_ERROR' });
         }
     });

     socket.on('inviteUserToList', async ({ listId, usernameToInvite }, callback) => {
         try {
             // Check ownership and that list isn't public
             const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
             if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
             if (list.isPublic) { return callback?.({ error: 'Cannot invite users to a public list', code: 'LIST_IS_PUBLIC' }); }

             // Validate username
             if (!usernameToInvite || typeof usernameToInvite !== 'string') { return callback?.({ error: 'Invalid username', code: 'INVALID_USERNAME' }); }

             // Find the target user
             const targetUser = await User.findOne({ username: usernameToInvite.toLowerCase() }).select('_id username').lean();
             if (!targetUser) { return callback?.({ error: 'User not found', code: 'USER_NOT_FOUND' }); }
             if (targetUser._id.equals(user._id)) { return callback?.({ error: 'Cannot invite yourself', code: 'CANNOT_INVITE_SELF' }); }

             // Check if user is already allowed
             const isAlreadyAllowed = list.allowedUsers.some(id => id.equals(targetUser._id));
             if (isAlreadyAllowed) { return callback?.({ error: 'User already has access', code: 'ALREADY_ALLOWED' }); }

             // Add user and save
             list.allowedUsers.push(targetUser._id);
             await list.save();
             console.log(`User ${targetUser.username} invited to list ${listId} by owner ${user.username}`);

             // Emit the full updated list data to relevant users/rooms
             await emitListUpdate(listId);

             // Optionally: Emit a specific 'invited' event to the target user?
             // io.to(targetUser._id.toString()).emit('invitedToList', updatedListData);

             callback?.({ success: true });
         } catch (error) {
             console.error(`Error inviting user to list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to invite user: ' + error.message, code: 'DB_ERROR' });
         }
     });

     socket.on('removeUserFromList', async ({ listId, userIdToRemove }, callback) => {
         try {
             // Validate user ID format
             if (!mongoose.Types.ObjectId.isValid(userIdToRemove)) { return callback?.({ error: 'Invalid user ID to remove', code: 'INVALID_USER_ID' }); }

             // Check ownership and that list isn't public
             const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
             if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
             if (list.isPublic) { return callback?.({ error: 'Cannot remove users from a public list', code: 'LIST_IS_PUBLIC' }); }

             const initialLength = list.allowedUsers.length;
             // Filter out the user ID
             list.allowedUsers = list.allowedUsers.filter(id => !id.equals(userIdToRemove));

             // Check if user was actually removed
             if (list.allowedUsers.length === initialLength) {
                 return callback?.({ error: 'User was not in the allowed list', code: 'USER_NOT_ALLOWED' });
             }

             // Save changes
             await list.save();
             const listIdStr = listId.toString();
             console.log(`User ${userIdToRemove} removed from list ${listIdStr} by owner ${user.username}`);

             // Emit the full updated list data
             await emitListUpdate(listId);

             // Notify the removed user specifically that they lost access
             io.to(userIdToRemove.toString()).emit('listDeleted', listIdStr);

             callback?.({ success: true });
         } catch (error) {
             console.error(`Error removing user from list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to remove user: ' + error.message, code: 'DB_ERROR' });
         }
     });


    // --- Item Events ---
    socket.on('addItem', async ({ listId, itemName }, callback) => {
         try {
             // Validate item name
             if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) { return callback?.({ error: 'Item name cannot be empty', code: 'INVALID_NAME' }); }
             if (itemName.length > 150) { return callback?.({ error: 'Item name too long (max 150)', code: 'NAME_TOO_LONG' }); }

             // Check if user can access the list
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();

             // Create and save the new item
             const newItem = new Item({ name: itemName.trim(), listId: listId });
             await newItem.save();

             // Emit the 'itemAdded' event to the list room
             const itemToSend = { ...newItem.toObject(), listId: listIdStr }; // Ensure listId is string
             io.to(listIdStr).emit('itemAdded', itemToSend);

             // Return the full new item in the callback for sync mapping
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error adding item to list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to add item: ' + error.message, code: 'DB_ERROR' });
         }
    });

     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         try {
             // Validate IDs and check list access
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();

             // Find the item within the specific list
             const item = await Item.findOne({ _id: itemId, listId: listId });
             if (!item) { return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' }); }

             // Toggle completion state and save
             item.completed = !item.completed;
             await item.save();

             // Emit the 'itemUpdated' event to the list room
             const itemToSend = { ...item.toObject(), listId: listIdStr };
             io.to(listIdStr).emit('itemUpdated', itemToSend);

             // Return the full updated item in the callback
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error toggling item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to toggle item: ' + error.message, code: 'DB_ERROR' });
         }
     });

     socket.on('deleteItem', async ({ listId, itemId }, callback) => {
         try {
             // Validate IDs and check list access
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const itemIdStr = itemId.toString();

             // Find and delete the item belonging to this list
             const item = await Item.findOneAndDelete({ _id: itemId, listId: listId });
             if (!item) {
                 console.warn(`Attempt to delete item ${itemIdStr} from list ${listIdStr} by ${user.username}, but item not found.`);
                 return callback?.({ error: 'Item not found or already deleted', code: 'ITEM_NOT_FOUND' });
             }

             // Emit the 'itemDeleted' event to the list room
             io.to(listIdStr).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr });
             callback?.({ success: true, itemId: itemIdStr });
         } catch (error) {
             console.error(`Error deleting item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to delete item: ' + error.message, code: 'DB_ERROR' });
         }
     });


    // --- Room Management ---
    socket.on('joinList', async (listId) => {
         // Check access before joining room
         const list = await checkListAccess(listId);
         if(list) {
            const listIdStr = listId.toString();
            console.log(`User ${user.username} (Socket: ${socket.id}) joining room for list: ${listIdStr}`);
            socket.join(listIdStr); // Join list-specific room
            // Also join user-specific room (useful for direct notifications like invites)
            socket.join(user._id.toString());
         } else {
             console.warn(`User ${user.username} denied joining room for list ${listId} (no access).`)
         }
    });

    socket.on('leaveList', (listId) => {
        // Client explicitely leaves a list view
        if (listId && typeof listId === 'string') {
            console.log(`User ${user.username} (Socket: ${socket.id}) leaving room for list: ${listId}`);
            socket.leave(listId);
        } else {
            console.warn(`User ${user.username} sent invalid leaveList request for ID: ${listId}`);
        }
    });


    // --- Disconnect ---
    socket.on('disconnect', (reason) => {
        const username = socket.request.user?.username || '(Unknown: Auth failed?)';
        console.log(`User disconnected: ${username} (Socket ID: ${socket.id}). Reason: ${reason}`);
        // Socket.IO automatically handles leaving rooms on disconnect.
    });
});


// --- Serve Frontend Statically in Production ---
if (process.env.NODE_ENV === 'production') {
     const clientBuildPath = path.resolve(__dirname, '../client/dist');
     console.log(`Production mode: Serving static files from: ${clientBuildPath}`);
     // Serve static files (JS, CSS, images)
     app.use(express.static(clientBuildPath));
     // Handle SPA routing: send index.html for any request not matching API or static files
     app.get('*', (req, res) => {
         res.sendFile(path.resolve(clientBuildPath, 'index.html'));
     });
} else {
     // Simple root message for development mode
     app.get('/', (req, res) => { res.send("API is running in development mode..."); });
}

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { // Listen on all available network interfaces
    console.log(`Server running on port ${PORT}`);
    console.log(`Client expected at: ${CLIENT_ORIGIN || 'http://localhost:5173 (default)'}`);
     if(!ADMIN_PIN_HASH) {
          // Warn if Admin PIN is not set (security risk for admin panel)
          console.warn('\x1b[33m%s\x1b[0m', 'WARN: ADMIN_PIN is not set in .env. Admin panel verification will not work.');
     }
});