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
const Item = require('./models/Item'); // Item model now includes 'comment'
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
if (!MONGODB_URI) { console.error("FATAL ERROR: MONGODB_URI is not defined."); process.exit(1); }
if (!CLIENT_ORIGIN) { console.warn("WARN: CORS_ORIGIN is not defined. Allowing any origin."); }
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET is not defined."); process.exit(1); }

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = { origin: CLIENT_ORIGIN || '*', credentials: true };
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => { console.error('MongoDB Connection Error:', err); process.exit(1); });

// --- Socket.IO Setup ---
const io = new Server(server, { cors: corsOptions });

// --- Socket.IO Authentication Middleware ---
io.use(async (socket, next) => { /* ... (no change) ... */ let token = null; const cookies = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie) : {}; token = cookies[COOKIE_NAME]; if (!token && socket.handshake.auth?.token) { token = socket.handshake.auth.token; } if (!token) { return next(new Error('Authentication error: No token provided')); } try { const decoded = verifyToken(token); if (!decoded || !decoded.id) { return next(new Error('Authentication error: Invalid token')); } const user = await User.findById(decoded.id).select('username isAdmin _id').lean(); if (!user) { return next(new Error('Authentication error: User not found')); } socket.request.user = user; next(); } catch (error) { if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') { next(new Error('Authentication error: Invalid or expired token')); } else { next(new Error('Authentication error: Server error during verification')); } } });


// ========== API Routes ==========

// --- Authentication Routes ---
app.post('/api/auth/login', async (req, res) => { /* ... (no change) ... */ const { username, pin } = req.body; if (!username || !pin) { return res.status(400).json({ message: 'Please provide username and PIN' }); } try { const user = await User.findOne({ username: username.toLowerCase() }); if (user && (await user.comparePin(pin))) { const token = generateToken(user._id, user.username, user.isAdmin); setTokenCookie(res, token); res.json({ _id: user._id, username: user.username, isAdmin: user.isAdmin }); } else { res.status(401).json({ message: 'Invalid username or PIN' }); } } catch (error) { console.error("Login error:", error); res.status(500).json({ message: 'Server error during login' }); } });
app.post('/api/auth/logout', (req, res) => { /* ... (no change) ... */ clearTokenCookie(res); res.status(200).json({ message: 'Logged out successfully' }); });
app.get('/api/auth/session', protect, (req, res) => { /* ... (no change) ... */ res.json({ _id: req.user._id, username: req.user.username, isAdmin: req.user.isAdmin }); });
// --- User Search Route ---
app.get('/api/users/search', protect, async (req, res) => { /* ... (no change) ... */ const query = req.query.q || ''; const currentUserId = req.user._id; if (!query) { return res.json([]); } try { const users = await User.find({ username: { $regex: `^${query}`, $options: 'i' }, _id: { $ne: currentUserId } }).select('username _id').limit(10).lean(); res.json(users); } catch (error) { console.error("Error searching users:", error); res.status(500).json({ message: "Error searching users" }); } });

// --- Standard Shopping List Routes ---
// **MODIFIED**: Ensure items fetched include the 'comment' field
app.get('/api/lists', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const lists = await ShoppingList.find({ $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ] })
            .populate('owner', 'username _id')
            .populate('allowedUsers', 'username _id')
            .sort({ name: 1 })
            .lean();
        const listsWithItems = await Promise.all(lists.map(async (list) => {
            // Fetch items including the new 'comment' field
            const items = await Item.find({ listId: list._id })
                                    .select('name completed comment createdAt updatedAt') // Include comment
                                    .sort({ createdAt: 1 })
                                    .lean();
            return { ...list, items: items };
        }));
        res.json(listsWithItems);
    } catch (error) {
        console.error("Error fetching lists:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
});

// **MODIFIED**: Ensure items fetched include the 'comment' field
app.get('/api/lists/:listId/items', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const listId = req.params.listId;
        if (!mongoose.Types.ObjectId.isValid(listId)) { return res.status(400).json({ message: 'Invalid list ID format' }); }
        const list = await ShoppingList.findOne({ _id: listId, $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ] }).select('_id');
        if (!list) { return res.status(403).json({ message: 'List not found or access denied' }); }
        // Fetch items including the new 'comment' field
        const items = await Item.find({ listId: listId })
                                .select('name completed comment createdAt updatedAt') // Include comment
                                .sort({ createdAt: 1 });
        res.json(items);
    } catch (error) {
        console.error(`Error fetching items for list ${req.params.listId}:`, error);
        res.status(500).json({ message: 'Error fetching items' });
    }
});


// ========== ADMIN API Routes ==========

// --- Admin: Verify Admin PIN ---
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => { /* ... (no change) ... */ const { pin } = req.body; if (!ADMIN_PIN_HASH) { return res.status(500).json({ message: "Admin PIN not configured on server." }); } if (!pin) { return res.status(400).json({ message: "PIN is required." }); } try { const isMatch = await bcrypt.compare(pin, ADMIN_PIN_HASH); if (isMatch) { res.status(200).json({ message: "Admin PIN verified." }); } else { res.status(401).json({ message: "Invalid Admin PIN." }); } } catch (error) { console.error("Admin PIN check error:", error); res.status(500).json({ message: 'Server error verifying admin PIN' }); } });
// --- Admin: Get All Users ---
app.get('/api/admin/users', protect, adminProtect, async (req, res) => { /* ... (no change) ... */ try { const users = await User.find().select('-pin -__v').sort({ username: 1 }).lean(); res.json(users); } catch (error) { console.error("Admin: Error fetching users:", error); res.status(500).json({ message: 'Error fetching users' }); } });
// --- Admin: Add New User ---
app.post('/api/admin/users', protect, adminProtect, async (req, res) => { /* ... (no change) ... */ const { username, pin } = req.body; if (!username || typeof username !== 'string' || username.trim().length < 3) { return res.status(400).json({ message: 'Username must be at least 3 characters long' }); } if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) { return res.status(400).json({ message: 'PIN must be exactly 4 digits' }); } const cleanUsername = username.toLowerCase().trim(); try { const existingUser = await User.findOne({ username: cleanUsername }); if (existingUser) { return res.status(400).json({ message: 'Username already exists' }); } const newUser = new User({ username: cleanUsername, pin: pin, isAdmin: false }); await newUser.save(); const userToReturn = newUser.toObject(); delete userToReturn.pin; delete userToReturn.__v; res.status(201).json(userToReturn); } catch (error) { console.error("Admin: Error adding user:", error); if (error.code === 11000) { return res.status(400).json({ message: 'Username already exists' }); } res.status(500).json({ message: 'Error adding user' }); } });
// --- Admin: Delete User ---
app.delete('/api/admin/users/:userId', protect, adminProtect, async (req, res) => { /* ... (no change) ... */ const { userId } = req.params; const adminUserId = req.user._id.toString(); if (!mongoose.Types.ObjectId.isValid(userId)) { return res.status(400).json({ message: 'Invalid user ID format' }); } if (userId === adminUserId) { return res.status(400).json({ message: 'Admin cannot delete themselves' }); } try { const userToDelete = await User.findById(userId); if (!userToDelete) { return res.status(404).json({ message: 'User not found' }); } const listsToDelete = await ShoppingList.find({ owner: userId }).select('_id'); const listIdsToDelete = listsToDelete.map(list => list._id); if (listIdsToDelete.length > 0) { await Item.deleteMany({ listId: { $in: listIdsToDelete } }); await ShoppingList.deleteMany({ _id: { $in: listIdsToDelete } }); console.log(`Admin: Deleted ${listIdsToDelete.length} lists and their items owned by user ${userId}`); } await User.findByIdAndDelete(userId); console.log(`Admin: Deleted user ${userId}`); await ShoppingList.updateMany( { allowedUsers: userId }, { $pull: { allowedUsers: userId } } ); res.status(200).json({ message: 'User and associated data deleted successfully' }); } catch (error) { console.error(`Admin: Error deleting user ${userId}:`, error); res.status(500).json({ message: 'Error deleting user' }); } });
// --- Admin: Get All Lists (with Filters) ---
// **MODIFIED**: Ensure items fetched include the 'comment' field
app.get('/api/admin/lists', protect, adminProtect, async (req, res) => {
    const { userId, privacy } = req.query;
    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) { filter.owner = userId; }
    if (privacy === 'public') { filter.isPublic = true; } else if (privacy === 'private') { filter.isPublic = false; }
    try {
        const lists = await ShoppingList.find(filter)
            .populate('owner', 'username _id')
            .populate('allowedUsers', 'username _id')
            .sort({ createdAt: -1 })
            .lean();
        const listsWithItems = await Promise.all(lists.map(async (list) => {
            // Include comment in item fetch
            const items = await Item.find({ listId: list._id })
                                    .select('name completed comment') // Select necessary fields
                                    .lean();
            return { ...list, items: items };
        }));
        res.json(listsWithItems);
    } catch (error) {
        console.error("Admin: Error fetching lists:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
});
// --- Admin: Delete List ---
app.delete('/api/admin/lists/:listId', protect, adminProtect, async (req, res) => { /* ... (no change) ... */ const { listId } = req.params; const adminUsername = req.user.username; if (!mongoose.Types.ObjectId.isValid(listId)) { return res.status(400).json({ message: 'Invalid list ID format' }); } try { const listToDelete = await ShoppingList.findById(listId); if (!listToDelete) { return res.status(404).json({ message: 'List not found' }); } const deleteItemsResult = await Item.deleteMany({ listId: listId }); console.log(`Admin (${adminUsername}): Deleted ${deleteItemsResult.deletedCount} items from list ${listId}`); await ShoppingList.findByIdAndDelete(listId); console.log(`Admin (${adminUsername}): Deleted list ${listId}`); res.status(200).json({ message: 'List and associated items deleted successfully' }); } catch (error) { console.error(`Admin (${adminUsername}): Error deleting list ${listId}:`, error); res.status(500).json({ message: 'Server error deleting list' }); } });

// ========== Socket.IO Event Handlers ==========
io.on('connection', (socket) => {
    const user = socket.request.user;
    if(!user) { socket.disconnect(true); return; }
    console.log(`User connected: ${user.username} (Socket ID: ${socket.id})`);

    // --- Helpers (checkListAccess, checkListOwnership, emitListUpdate - no changes needed) ---
    const checkListAccess = async (listId, projection = '_id owner isPublic allowedUsers') => { /* ... (no change) ... */ if (!mongoose.Types.ObjectId.isValid(listId)) { console.warn(`Invalid list ID format received from ${user.username}: ${listId}`); return null; } try { return await ShoppingList.findOne({ _id: listId, $or: [ { owner: user._id }, { isPublic: true }, { allowedUsers: user._id } ] }).select(projection).lean(); } catch (error) { console.error(`Database error checking access for user ${user.username} on list ${listId}:`, error); return null; } };
    const checkListOwnership = async (listId) => { /* ... (no change) ... */ if (!mongoose.Types.ObjectId.isValid(listId)) return null; try { return await ShoppingList.findOne({ _id: listId, owner: user._id }).select('_id').lean(); } catch (error) { console.error(`Database error checking ownership for user ${user.username} on list ${listId}:`, error); return null; } };
    const emitListUpdate = async (listId) => { /* ... (no change) ... */ try { const updatedList = await ShoppingList.findById(listId) .populate('owner', 'username _id') .populate('allowedUsers', 'username _id') .populate('items') .lean(); if (!updatedList) { console.warn(`Attempted to emit update for non-existent list ${listId}`); return; } const listIdStr = listId.toString(); console.log(`Emitting listsUpdated to room: ${listIdStr}`); io.to(listIdStr).emit('listsUpdated', updatedList); if (!updatedList.isPublic) { const ownerIdStr = updatedList.owner._id.toString(); console.log(`Emitting listsUpdated to owner: ${ownerIdStr}`); io.to(ownerIdStr).emit('listsUpdated', updatedList); updatedList.allowedUsers.forEach(allowedUser => { const allowedUserIdStr = allowedUser._id.toString(); if (allowedUserIdStr !== ownerIdStr) { console.log(`Emitting listsUpdated to allowed user: ${allowedUserIdStr}`); io.to(allowedUserIdStr).emit('listsUpdated', updatedList); } }); } } catch (error) { console.error(`Error fetching/emitting update for list ${listId}:`, error); } };

    // --- List Events (no changes needed) ---
    socket.on('addList', async ({ name, isPublic }, callback) => { /* ... (no change) ... */ try { if (!name || typeof name !== 'string' || name.trim().length === 0) return callback?.({ error: 'List name cannot be empty', code: 'INVALID_NAME' }); if (name.length > 100) return callback?.({ error: 'List name too long (max 100)', code: 'NAME_TOO_LONG' }); const newList = new ShoppingList({ name: name.trim(), owner: user._id, isPublic: !!isPublic, allowedUsers: [] }); await newList.save(); const populatedList = await ShoppingList.findById(newList._id) .populate('owner', 'username _id') .lean(); populatedList.items = []; const listIdStr = populatedList._id.toString(); console.log(`List '${populatedList.name}' (ID: ${listIdStr}) added by user ${user.username}`); socket.emit('listsUpdated', populatedList); socket.join(listIdStr); callback?.({ success: true, newList: populatedList }); } catch (error) { console.error(`Error adding list for user ${user.username}:`, error); callback?.({ error: 'Failed to add list: ' + error.message, code: 'DB_ERROR' }); } });
    socket.on('deleteList', async (listId, callback) => { /* ... (no change) ... */ try { const list = await checkListOwnership(listId); if (!list) { console.warn(`User ${user.username} attempted delete on list ${listId} they don't own or doesn't exist.`); return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); } const listIdStr = listId.toString(); await Item.deleteMany({ listId: listId }); await ShoppingList.findByIdAndDelete(listId); console.log(`List ${listIdStr} deleted by owner ${user.username}`); io.emit('listDeleted', listIdStr); callback?.({ success: true }); } catch (error) { console.error(`Error deleting list ${listId} for user ${user.username}:`, error); callback?.({ error: 'Failed to delete list: ' + error.message, code: 'DB_ERROR' }); } });
    socket.on('toggleListPrivacy', async (listId, callback) => { /* ... (no change) ... */ try { const list = await ShoppingList.findOne({ _id: listId, owner: user._id }); if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); } list.isPublic = !list.isPublic; await list.save(); const listIdStr = listId.toString(); console.log(`List ${listIdStr} privacy toggled to ${list.isPublic ? 'public' : 'private'} by owner ${user.username}`); await emitListUpdate(listId); callback?.({ success: true, isPublic: list.isPublic }); } catch (error) { console.error(`Error toggling privacy for list ${listId} by ${user.username}:`, error); callback?.({ error: 'Failed to update privacy: ' + error.message, code: 'DB_ERROR' }); } });
    socket.on('inviteUserToList', async ({ listId, usernameToInvite }, callback) => { /* ... (no change) ... */ try { const list = await ShoppingList.findOne({ _id: listId, owner: user._id }); if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); } if (list.isPublic) { return callback?.({ error: 'Cannot invite users to a public list', code: 'LIST_IS_PUBLIC' }); } if (!usernameToInvite || typeof usernameToInvite !== 'string') { return callback?.({ error: 'Invalid username', code: 'INVALID_USERNAME' }); } const targetUser = await User.findOne({ username: usernameToInvite.toLowerCase() }).select('_id username').lean(); if (!targetUser) { return callback?.({ error: 'User not found', code: 'USER_NOT_FOUND' }); } if (targetUser._id.equals(user._id)) { return callback?.({ error: 'Cannot invite yourself', code: 'CANNOT_INVITE_SELF' }); } const isAlreadyAllowed = list.allowedUsers.some(id => id.equals(targetUser._id)); if (isAlreadyAllowed) { return callback?.({ error: 'User already has access', code: 'ALREADY_ALLOWED' }); } list.allowedUsers.push(targetUser._id); await list.save(); console.log(`User ${targetUser.username} invited to list ${listId} by owner ${user.username}`); await emitListUpdate(listId); callback?.({ success: true }); } catch (error) { console.error(`Error inviting user to list ${listId} by ${user.username}:`, error); callback?.({ error: 'Failed to invite user: ' + error.message, code: 'DB_ERROR' }); } });
    socket.on('removeUserFromList', async ({ listId, userIdToRemove }, callback) => { /* ... (no change) ... */ try { if (!mongoose.Types.ObjectId.isValid(userIdToRemove)) { return callback?.({ error: 'Invalid user ID to remove', code: 'INVALID_USER_ID' }); } const list = await ShoppingList.findOne({ _id: listId, owner: user._id }); if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); } if (list.isPublic) { return callback?.({ error: 'Cannot remove users from a public list', code: 'LIST_IS_PUBLIC' }); } const initialLength = list.allowedUsers.length; list.allowedUsers = list.allowedUsers.filter(id => !id.equals(userIdToRemove)); if (list.allowedUsers.length === initialLength) { return callback?.({ error: 'User was not in the allowed list', code: 'USER_NOT_ALLOWED' }); } await list.save(); const listIdStr = listId.toString(); console.log(`User ${userIdToRemove} removed from list ${listIdStr} by owner ${user.username}`); await emitListUpdate(listId); io.to(userIdToRemove.toString()).emit('listDeleted', listIdStr); callback?.({ success: true }); } catch (error) { console.error(`Error removing user from list ${listId} by ${user.username}:`, error); callback?.({ error: 'Failed to remove user: ' + error.message, code: 'DB_ERROR' }); } });

    // --- Item Events ---
    // **MODIFIED**: Include 'comment' in emitted item data
    socket.on('addItem', async ({ listId, itemName }, callback) => {
         try {
             if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) { return callback?.({ error: 'Item name cannot be empty', code: 'INVALID_NAME' }); }
             if (itemName.length > 150) { return callback?.({ error: 'Item name too long (max 150)', code: 'NAME_TOO_LONG' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const newItem = new Item({ name: itemName.trim(), listId: listId, comment: '' }); // Ensure comment defaults to empty string
             await newItem.save();
             const itemToSend = { ...newItem.toObject(), listId: listIdStr };
             io.to(listIdStr).emit('itemAdded', itemToSend);
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error adding item to list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to add item: ' + error.message, code: 'DB_ERROR' });
         }
    });

    // **MODIFIED**: Include 'comment' in emitted item data
     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const item = await Item.findOne({ _id: itemId, listId: listId });
             if (!item) { return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' }); }
             item.completed = !item.completed;
             await item.save();
             const itemToSend = { ...item.toObject(), listId: listIdStr };
             io.to(listIdStr).emit('itemUpdated', itemToSend);
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error toggling item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to toggle item: ' + error.message, code: 'DB_ERROR' });
         }
     });

     socket.on('deleteItem', async ({ listId, itemId }, callback) => { /* ... (no change needed for comment) ... */ try { if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); } const list = await checkListAccess(listId); if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); } const listIdStr = listId.toString(); const itemIdStr = itemId.toString(); const item = await Item.findOneAndDelete({ _id: itemId, listId: listId }); if (!item) { console.warn(`Attempt to delete item ${itemIdStr} from list ${listIdStr} by ${user.username}, but item not found.`); return callback?.({ error: 'Item not found or already deleted', code: 'ITEM_NOT_FOUND' }); } io.to(listIdStr).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr }); callback?.({ success: true, itemId: itemIdStr }); } catch (error) { console.error(`Error deleting item ${itemId} by ${user.username}:`, error); callback?.({ error: 'Failed to delete item: ' + error.message, code: 'DB_ERROR' }); } });


    // --- NEW: Item Comment Event ---
    socket.on('updateItemComment', async ({ listId, itemId, comment }, callback) => {
        try {
            // Validate IDs
            if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(itemId)) {
                return callback?.({ error: 'Invalid list or item ID', code: 'INVALID_ID' });
            }
            // Validate comment (allow empty string, check max length if defined in schema)
            if (typeof comment !== 'string') {
                 return callback?.({ error: 'Invalid comment format', code: 'INVALID_COMMENT' });
            }
             const trimmedComment = comment.trim();
             if (trimmedComment.length > 500) { // Assuming 500 max length from schema
                 return callback?.({ error: 'Comment too long (max 500)', code: 'COMMENT_TOO_LONG' });
             }

            // Check list access
            const list = await checkListAccess(listId);
            if (!list) {
                return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
            }
            const listIdStr = listId.toString();

            // Find the item within the specified list
            const item = await Item.findOne({ _id: itemId, listId: listId });
            if (!item) {
                return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' });
            }

            // Update comment and save
            item.comment = trimmedComment;
            await item.save();

            // Emit the full updated item to the list room
            const itemToSend = { ...item.toObject(), listId: listIdStr };
            io.to(listIdStr).emit('itemUpdated', itemToSend); // Re-use itemUpdated event
            console.log(`Comment updated for item ${itemId} in list ${listIdStr} by ${user.username}`);

            // Return updated item in callback
            callback?.({ success: true, item: itemToSend });

        } catch (error) {
            console.error(`Error updating comment for item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to update comment: ' + error.message, code: 'DB_ERROR' });
        }
    });


    // --- Room Management ---
    socket.on('joinList', async (listId) => { /* ... (no change) ... */ const list = await checkListAccess(listId); if(list) { const listIdStr = listId.toString(); console.log(`User ${user.username} (Socket: ${socket.id}) joining room for list: ${listIdStr}`); socket.join(listIdStr); socket.join(user._id.toString()); } else { console.warn(`User ${user.username} denied joining room for list ${listId} (no access).`) } });
    socket.on('leaveList', (listId) => { /* ... (no change) ... */ if (listId && typeof listId === 'string') { console.log(`User ${user.username} (Socket: ${socket.id}) leaving room for list: ${listId}`); socket.leave(listId); } else { console.warn(`User ${user.username} sent invalid leaveList request for ID: ${listId}`); } });
    // --- Disconnect ---
    socket.on('disconnect', (reason) => { /* ... (no change) ... */ const username = socket.request.user?.username || '(Unknown: Auth failed?)'; console.log(`User disconnected: ${username} (Socket ID: ${socket.id}). Reason: ${reason}`); });
});


// --- Serve Frontend Statically in Production ---
if (process.env.NODE_ENV === 'production') { /* ... (no change) ... */ const clientBuildPath = path.resolve(__dirname, '../client/dist'); console.log(`Production mode: Serving static files from: ${clientBuildPath}`); app.use(express.static(clientBuildPath)); app.get('*', (req, res) => { res.sendFile(path.resolve(clientBuildPath, 'index.html')); }); }
else { /* ... (no change) ... */ app.get('/', (req, res) => { res.send("API is running in development mode..."); }); }

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { /* ... (no change) ... */ console.log(`Server running on port ${PORT}`); console.log(`Client expected at: ${CLIENT_ORIGIN || 'http://localhost:5173 (default)'}`); if(!ADMIN_PIN_HASH) { console.warn('\x1b[33m%s\x1b[0m', 'WARN: ADMIN_PIN is not set. Admin panel verification will not work.'); } });