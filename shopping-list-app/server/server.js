// server/server.js
// Description: Backend server using Express and Socket.IO. Handles API requests,
// WebSocket connections, authentication, database interactions (MongoDB/Mongoose),
// and real-time updates for the shopping list application. Includes action logging.

require('dotenv').config(); // Load environment variables first
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cookie = require('cookie');
const bcrypt = require('bcryptjs');

// --- Import Models ---
const ShoppingList = require('./models/ShoppingList');
const Item = require('./models/Item');
const User = require('./models/User');
const { LogEntry, ACTION_TYPES, TARGET_TYPES } = require('./models/LogEntry'); // Import Log model and enums

// --- Import Auth Utilities & Middleware ---
const { generateToken, setTokenCookie, clearTokenCookie, verifyToken, COOKIE_NAME } = require('./utils/auth');
const { protect, adminProtect } = require('./middleware/authMiddleware');
const { logAction } = require('./utils/logger'); // Import logging utility

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
app.set('trust proxy', 1); // Needed for req.ip behind a proxy

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => { console.error('MongoDB Connection Error:', err); process.exit(1); });

// --- Socket.IO Setup ---
const io = new Server(server, { cors: corsOptions });

// --- Socket.IO Authentication Middleware ---
io.use(async (socket, next) => { let token = null; const cookies = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie) : {}; token = cookies[COOKIE_NAME]; if (!token && socket.handshake.auth?.token) { token = socket.handshake.auth.token; } if (!token) { return next(new Error('Authentication error: No token provided')); } try { const decoded = verifyToken(token); if (!decoded || !decoded.id) { return next(new Error('Authentication error: Invalid token')); } const user = await User.findById(decoded.id).select('username isAdmin _id').lean(); if (!user) { return next(new Error('Authentication error: User not found')); } socket.request.user = user; next(); } catch (error) { if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') { next(new Error('Authentication error: Invalid or expired token')); } else { next(new Error('Authentication error: Server error during verification')); } } });


// ========== API Routes ==========

// --- Authentication Routes ---
app.post('/api/auth/login', async (req, res) => {
    const { username, pin } = req.body;
    const ipAddress = req.ip; // Get client IP address
    if (!username || !pin) {
        return res.status(400).json({ message: 'Please provide username and PIN' });
    }
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (user && (await user.comparePin(pin))) {
            const token = generateToken(user._id, user.username, user.isAdmin);
            setTokenCookie(res, token);

            // Log successful login
            logAction({
                userId: user._id,
                username: user.username,
                actionType: 'USER_LOGIN_SUCCESS',
                targetType: 'AUTH',
                ipAddress: ipAddress,
                details: { username: user.username }
            });

            res.json({ _id: user._id, username: user.username, isAdmin: user.isAdmin });
        } else {
            // Log failed login attempt
            logAction({
                actionType: 'USER_LOGIN_FAIL',
                targetType: 'AUTH',
                ipAddress: ipAddress,
                details: { attemptedUsername: username.toLowerCase() }
            });
            res.status(401).json({ message: 'Invalid username or PIN' });
        }
    } catch (error) {
        console.error("Login error:", error);
        // Log server error during login
        logAction({
            actionType: 'USER_LOGIN_FAIL',
            targetType: 'AUTH',
            ipAddress: ipAddress,
            details: { attemptedUsername: username.toLowerCase(), error: error.message }
        });
        res.status(500).json({ message: 'Server error during login' });
    }
});
app.post('/api/auth/logout', protect, (req, res) => { // Added protect to ensure req.user exists
    const ipAddress = req.ip;
    // Log logout action
    logAction({
        userId: req.user._id,
        username: req.user.username,
        actionType: 'USER_LOGOUT',
        targetType: 'AUTH',
        ipAddress: ipAddress
    });
    clearTokenCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
});
app.get('/api/auth/session', protect, (req, res) => {
    // Typically no log needed for session check
    res.json({ _id: req.user._id, username: req.user.username, isAdmin: req.user.isAdmin });
});
// --- User Search Route ---
app.get('/api/users/search', protect, async (req, res) => { const query = req.query.q || ''; const currentUserId = req.user._id; if (!query) { return res.json([]); } try { const users = await User.find({ username: { $regex: `^${query}`, $options: 'i' }, _id: { $ne: currentUserId } }).select('username _id').limit(10).lean(); res.json(users); } catch (error) { console.error("Error searching users:", error); res.status(500).json({ message: "Error searching users" }); } });

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
            const items = await Item.find({ listId: list._id })
                                    .select('name completed comment createdAt updatedAt')
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
        const items = await Item.find({ listId: listId })
                                .select('name completed comment createdAt updatedAt')
                                .sort({ createdAt: 1 });
        res.json(items);
    } catch (error) {
        console.error(`Error fetching items for list ${req.params.listId}:`, error);
        res.status(500).json({ message: 'Error fetching items' });
    }
});


// ========== ADMIN API Routes ==========

// --- Admin: Verify Admin PIN ---
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => {
    const { pin } = req.body;
    const ipAddress = req.ip;
    const adminUser = req.user; // User performing the check

    if (!ADMIN_PIN_HASH) {
        return res.status(500).json({ message: "Admin PIN not configured on server." });
    }
    if (!pin) {
        return res.status(400).json({ message: "PIN is required." });
    }
    try {
        const isMatch = await bcrypt.compare(pin, ADMIN_PIN_HASH);
        if (isMatch) {
            // Log successful verification
            logAction({
                userId: adminUser._id,
                username: adminUser.username,
                actionType: 'ADMIN_PIN_VERIFY_SUCCESS',
                targetType: 'AUTH',
                ipAddress: ipAddress
            });
            res.status(200).json({ message: "Admin PIN verified." });
        } else {
            // Log failed verification
            logAction({
                userId: adminUser._id,
                username: adminUser.username,
                actionType: 'ADMIN_PIN_VERIFY_FAIL',
                targetType: 'AUTH',
                ipAddress: ipAddress
            });
            res.status(401).json({ message: "Invalid Admin PIN." });
        }
    } catch (error) {
        console.error("Admin PIN check error:", error);
        // Log server error during verification
        logAction({
            userId: adminUser._id,
            username: adminUser.username,
            actionType: 'ADMIN_PIN_VERIFY_FAIL',
            targetType: 'AUTH',
            ipAddress: ipAddress,
            details: { error: error.message }
        });
        res.status(500).json({ message: 'Server error verifying admin PIN' });
    }
});
// --- Admin: Get All Users ---
app.get('/api/admin/users', protect, adminProtect, async (req, res) => { try { const users = await User.find().select('-hashedPin -__v').sort({ username: 1 }).lean(); res.json(users); } catch (error) { console.error("Admin: Error fetching users:", error); res.status(500).json({ message: 'Error fetching users' }); } });
// --- Admin: Add New User ---
app.post('/api/admin/users', protect, adminProtect, async (req, res) => {
    const { username, pin } = req.body;
    const adminUser = req.user; // Admin performing the action

    if (!username || typeof username !== 'string' || username.trim().length < 3) { return res.status(400).json({ message: 'Username must be at least 3 characters long' }); }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) { return res.status(400).json({ message: 'PIN must be exactly 4 digits' }); }
    const cleanUsername = username.toLowerCase().trim();
    try {
        const existingUser = await User.findOne({ username: cleanUsername });
        if (existingUser) { return res.status(400).json({ message: 'Username already exists' }); }

        // Hash the PIN before creating the user
        const hashedPin = await User.hashPin(pin);
        const newUser = new User({
             username: cleanUsername,
             hashedPin: hashedPin, // Store the hashed PIN
             isAdmin: false
        });
        await newUser.save();

        // Log successful user creation
        logAction({
            userId: adminUser._id,
            username: adminUser.username,
            actionType: 'ADMIN_USER_CREATE',
            targetType: 'USER',
            targetId: newUser._id.toString(),
            details: { createdUsername: newUser.username }
        });

        const userToReturn = newUser.toObject();
        delete userToReturn.hashedPin; // Never return the hash
        delete userToReturn.__v;
        res.status(201).json(userToReturn);
    } catch (error) {
        console.error("Admin: Error adding user:", error);
        if (error.code === 11000) { return res.status(400).json({ message: 'Username already exists' }); }
        res.status(500).json({ message: 'Error adding user' });
    }
});
// --- Admin: Delete User ---
app.delete('/api/admin/users/:userId', protect, adminProtect, async (req, res) => {
    const { userId } = req.params;
    const adminUser = req.user; // Admin performing the action

    if (!mongoose.Types.ObjectId.isValid(userId)) { return res.status(400).json({ message: 'Invalid user ID format' }); }
    if (userId === adminUser._id.toString()) { return res.status(400).json({ message: 'Admin cannot delete themselves' }); }
    try {
        const userToDelete = await User.findById(userId).select('username').lean(); // Get username before deleting
        if (!userToDelete) { return res.status(404).json({ message: 'User not found' }); }

        const listsToDelete = await ShoppingList.find({ owner: userId }).select('_id');
        const listIdsToDelete = listsToDelete.map(list => list._id);
        if (listIdsToDelete.length > 0) { await Item.deleteMany({ listId: { $in: listIdsToDelete } }); await ShoppingList.deleteMany({ _id: { $in: listIdsToDelete } }); console.log(`Admin: Deleted ${listIdsToDelete.length} lists and their items owned by user ${userId}`); }
        await User.findByIdAndDelete(userId);
        console.log(`Admin: Deleted user ${userId}`);
        await ShoppingList.updateMany( { allowedUsers: userId }, { $pull: { allowedUsers: userId } } );

        // Log successful user deletion
        logAction({
            userId: adminUser._id,
            username: adminUser.username,
            actionType: 'ADMIN_USER_DELETE',
            targetType: 'USER',
            targetId: userId,
            details: { deletedUsername: userToDelete.username }
        });

        res.status(200).json({ message: 'User and associated data deleted successfully' });
    } catch (error) {
        console.error(`Admin: Error deleting user ${userId}:`, error);
        res.status(500).json({ message: 'Error deleting user' });
    }
});
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
            const items = await Item.find({ listId: list._id })
                                    .select('name completed comment')
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
app.delete('/api/admin/lists/:listId', protect, adminProtect, async (req, res) => {
    const { listId } = req.params;
    const adminUser = req.user;

    if (!mongoose.Types.ObjectId.isValid(listId)) { return res.status(400).json({ message: 'Invalid list ID format' }); }
    try {
        const listToDelete = await ShoppingList.findById(listId).select('name').lean(); // Get name before delete
        if (!listToDelete) { return res.status(404).json({ message: 'List not found' }); }
        const deleteItemsResult = await Item.deleteMany({ listId: listId });
        console.log(`Admin (${adminUser.username}): Deleted ${deleteItemsResult.deletedCount} items from list ${listId}`);
        await ShoppingList.findByIdAndDelete(listId);
        console.log(`Admin (${adminUser.username}): Deleted list ${listId}`);

        // Log successful list deletion by admin
        logAction({
            userId: adminUser._id,
            username: adminUser.username,
            actionType: 'ADMIN_LIST_DELETE',
            targetType: 'LIST',
            targetId: listId,
            details: { deletedListName: listToDelete.name }
        });

        res.status(200).json({ message: 'List and associated items deleted successfully' });
    } catch (error) {
        console.error(`Admin (${adminUser.username}): Error deleting list ${listId}:`, error);
        res.status(500).json({ message: 'Server error deleting list' });
    }
});


// ========== NEW: Admin Logs API Route ==========
app.get('/api/admin/logs', protect, adminProtect, async (req, res) => {
    try {
        const {
            userId,
            actionType,
            targetType,
            dateStart,
            dateEnd,
            sortBy = 'timestamp', // Default sort
            sortOrder = 'desc',   // Default order
            page = 1,
            limit = 50 // Default page size
        } = req.query;

        const filter = {};

        // Build filter object based on query params
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            filter.userId = userId;
        }
        if (actionType && ACTION_TYPES.includes(actionType)) {
            filter.actionType = actionType;
        }
        if (targetType && TARGET_TYPES.includes(targetType)) {
            filter.targetType = targetType;
        }
        if (dateStart || dateEnd) {
            filter.timestamp = {};
            if (dateStart) {
                const startDate = new Date(dateStart);
                if (!isNaN(startDate)) filter.timestamp.$gte = startDate;
            }
            if (dateEnd) {
                 // Add 1 day to include the whole end date
                 const endDate = new Date(dateEnd);
                 if (!isNaN(endDate)) {
                    endDate.setDate(endDate.getDate() + 1);
                    filter.timestamp.$lt = endDate;
                 }
            }
        }

        // Pagination calculations
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Sorting
        const sortOptions = {};
        if (sortBy === 'timestamp' || sortBy === 'username' || sortBy === 'actionType') {
            sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
        } else {
            sortOptions['timestamp'] = -1; // Default sort if invalid field provided
        }

        // Query database
        const logs = await LogEntry.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'username') // Optionally populate user details if needed
            .lean();

        // Get total count for pagination
        const totalLogs = await LogEntry.countDocuments(filter);
        const totalPages = Math.ceil(totalLogs / limitNum);

        res.json({
            logs: logs,
            currentPage: pageNum,
            totalPages: totalPages,
            totalLogs: totalLogs,
            limit: limitNum
        });

    } catch (error) {
        console.error("Admin: Error fetching logs:", error);
        res.status(500).json({ message: 'Error fetching activity logs' });
    }
});


// ========== Socket.IO Event Handlers ==========
io.on('connection', (socket) => {
    const user = socket.request.user;
    if(!user) { socket.disconnect(true); return; }
    console.log(`User connected: ${user.username} (Socket ID: ${socket.id})`);

    // --- Helpers ---
    const checkListAccess = async (listId, projection = '_id owner isPublic allowedUsers') => { if (!mongoose.Types.ObjectId.isValid(listId)) { console.warn(`Invalid list ID format received from ${user.username}: ${listId}`); return null; } try { return await ShoppingList.findOne({ _id: listId, $or: [ { owner: user._id }, { isPublic: true }, { allowedUsers: user._id } ] }).select(projection).lean(); } catch (error) { console.error(`Database error checking access for user ${user.username} on list ${listId}:`, error); return null; } };
    const checkListOwnership = async (listId) => { if (!mongoose.Types.ObjectId.isValid(listId)) return null; try { return await ShoppingList.findOne({ _id: listId, owner: user._id }).select('_id').lean(); } catch (error) { console.error(`Database error checking ownership for user ${user.username} on list ${listId}:`, error); return null; } };
    const emitListUpdate = async (listId) => { try { const updatedList = await ShoppingList.findById(listId) .populate('owner', 'username _id') .populate('allowedUsers', 'username _id') .populate('items') .lean(); if (!updatedList) { console.warn(`Attempted to emit update for non-existent list ${listId}`); return; } const listIdStr = listId.toString(); console.log(`Emitting listsUpdated to room: ${listIdStr}`); io.to(listIdStr).emit('listsUpdated', updatedList); if (!updatedList.isPublic) { const ownerIdStr = updatedList.owner._id.toString(); console.log(`Emitting listsUpdated to owner: ${ownerIdStr}`); io.to(ownerIdStr).emit('listsUpdated', updatedList); updatedList.allowedUsers.forEach(allowedUser => { const allowedUserIdStr = allowedUser._id.toString(); if (allowedUserIdStr !== ownerIdStr) { console.log(`Emitting listsUpdated to allowed user: ${allowedUserIdStr}`); io.to(allowedUserIdStr).emit('listsUpdated', updatedList); } }); } } catch (error) { console.error(`Error fetching/emitting update for list ${listId}:`, error); } };

    // --- List Events ---
    socket.on('addList', async ({ name, isPublic }, callback) => {
        try {
            if (!name || typeof name !== 'string' || name.trim().length === 0) return callback?.({ error: 'List name cannot be empty', code: 'INVALID_NAME' });
            if (name.length > 100) return callback?.({ error: 'List name too long (max 100)', code: 'NAME_TOO_LONG' });
            const newList = new ShoppingList({ name: name.trim(), owner: user._id, isPublic: !!isPublic, allowedUsers: [] });
            await newList.save();
            const populatedList = await ShoppingList.findById(newList._id)
                .populate('owner', 'username _id')
                .lean();
            populatedList.items = [];
            const listIdStr = populatedList._id.toString();
            console.log(`List '${populatedList.name}' (ID: ${listIdStr}) added by user ${user.username}`);

            // Log list creation
            logAction({
                userId: user._id, username: user.username,
                actionType: 'LIST_CREATE', targetType: 'LIST', targetId: listIdStr,
                details: { listName: populatedList.name, isPublic: populatedList.isPublic }
            });

            socket.emit('listsUpdated', populatedList);
            socket.join(listIdStr);
            callback?.({ success: true, newList: populatedList });
        } catch (error) {
            console.error(`Error adding list for user ${user.username}:`, error);
            callback?.({ error: 'Failed to add list: ' + error.message, code: 'DB_ERROR' });
        }
    });
    socket.on('deleteList', async (listId, callback) => {
        try {
            const list = await checkListOwnership(listId);
            if (!list) { console.warn(`User ${user.username} attempted delete on list ${listId} they don't own or doesn't exist.`); return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
            const listIdStr = listId.toString();
            await Item.deleteMany({ listId: listId });
            await ShoppingList.findByIdAndDelete(listId);
            console.log(`List ${listIdStr} deleted by owner ${user.username}`);

            // Log list deletion
            logAction({
                userId: user._id, username: user.username,
                actionType: 'LIST_DELETE', targetType: 'LIST', targetId: listIdStr
            });

            io.emit('listDeleted', listIdStr);
            callback?.({ success: true });
        } catch (error) {
            console.error(`Error deleting list ${listId} for user ${user.username}:`, error);
            callback?.({ error: 'Failed to delete list: ' + error.message, code: 'DB_ERROR' });
        }
    });
    socket.on('toggleListPrivacy', async (listId, callback) => {
        try {
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
            if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
            const oldPrivacy = list.isPublic;
            list.isPublic = !list.isPublic;
            await list.save();
            const listIdStr = listId.toString();
            console.log(`List ${listIdStr} privacy toggled to ${list.isPublic ? 'public' : 'private'} by owner ${user.username}`);

            // Log privacy toggle
            logAction({
                userId: user._id, username: user.username,
                actionType: 'LIST_PRIVACY_TOGGLE', targetType: 'LIST', targetId: listIdStr,
                details: { oldPrivacy: oldPrivacy, newPrivacy: list.isPublic }
            });

            await emitListUpdate(listId);
            callback?.({ success: true, isPublic: list.isPublic });
        } catch (error) {
            console.error(`Error toggling privacy for list ${listId} by ${user.username}:`, error);
            callback?.({ error: 'Failed to update privacy: ' + error.message, code: 'DB_ERROR' });
        }
    });
    socket.on('inviteUserToList', async ({ listId, usernameToInvite }, callback) => {
        try {
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
            if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
            if (list.isPublic) { return callback?.({ error: 'Cannot invite users to a public list', code: 'LIST_IS_PUBLIC' }); }
            if (!usernameToInvite || typeof usernameToInvite !== 'string') { return callback?.({ error: 'Invalid username', code: 'INVALID_USERNAME' }); }
            const targetUser = await User.findOne({ username: usernameToInvite.toLowerCase() }).select('_id username').lean();
            if (!targetUser) { return callback?.({ error: 'User not found', code: 'USER_NOT_FOUND' }); }
            if (targetUser._id.equals(user._id)) { return callback?.({ error: 'Cannot invite yourself', code: 'CANNOT_INVITE_SELF' }); }
            const isAlreadyAllowed = list.allowedUsers.some(id => id.equals(targetUser._id));
            if (isAlreadyAllowed) { return callback?.({ error: 'User already has access', code: 'ALREADY_ALLOWED' }); }
            list.allowedUsers.push(targetUser._id);
            await list.save();
            console.log(`User ${targetUser.username} invited to list ${listId} by owner ${user.username}`);

            // Log user invite
            logAction({
                userId: user._id, username: user.username,
                actionType: 'LIST_USER_INVITE', targetType: 'LIST', targetId: listId.toString(),
                details: { listName: list.name, invitedUserId: targetUser._id.toString(), invitedUsername: targetUser.username }
            });

            await emitListUpdate(listId);
            callback?.({ success: true });
        } catch (error) {
            console.error(`Error inviting user to list ${listId} by ${user.username}:`, error);
            callback?.({ error: 'Failed to invite user: ' + error.message, code: 'DB_ERROR' });
        }
    });
    socket.on('removeUserFromList', async ({ listId, userIdToRemove }, callback) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(userIdToRemove)) { return callback?.({ error: 'Invalid user ID to remove', code: 'INVALID_USER_ID' }); }
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
            if (!list) { return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' }); }
            if (list.isPublic) { return callback?.({ error: 'Cannot remove users from a public list', code: 'LIST_IS_PUBLIC' }); }
            const initialLength = list.allowedUsers.length;
            const userToRemoveObjId = new mongoose.Types.ObjectId(userIdToRemove); // Ensure it's an ObjectId for comparison
            const userToRemoveDetails = await User.findById(userToRemoveObjId).select('username').lean(); // Get username for logging

            list.allowedUsers = list.allowedUsers.filter(id => !id.equals(userToRemoveObjId));
            if (list.allowedUsers.length === initialLength) { return callback?.({ error: 'User was not in the allowed list', code: 'USER_NOT_ALLOWED' }); }
            await list.save();
            const listIdStr = listId.toString();
            console.log(`User ${userIdToRemove} removed from list ${listIdStr} by owner ${user.username}`);

            // Log user removal
            logAction({
                 userId: user._id, username: user.username,
                 actionType: 'LIST_USER_REMOVE', targetType: 'LIST', targetId: listIdStr,
                 details: { listName: list.name, removedUserId: userIdToRemove, removedUsername: userToRemoveDetails?.username || 'Unknown' }
            });

            await emitListUpdate(listId);
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
             if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) { return callback?.({ error: 'Item name cannot be empty', code: 'INVALID_NAME' }); }
             if (itemName.length > 150) { return callback?.({ error: 'Item name too long (max 150)', code: 'NAME_TOO_LONG' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const newItem = new Item({ name: itemName.trim(), listId: listId, comment: '' });
             await newItem.save();
             const itemToSend = { ...newItem.toObject(), listId: listIdStr };

             // Log item addition
             logAction({
                 userId: user._id, username: user.username,
                 actionType: 'ITEM_ADD', targetType: 'ITEM', targetId: newItem._id.toString(),
                 details: { listId: listIdStr, itemName: newItem.name }
             });

             io.to(listIdStr).emit('itemAdded', itemToSend);
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error adding item to list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to add item: ' + error.message, code: 'DB_ERROR' });
         }
    });

     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const item = await Item.findOne({ _id: itemId, listId: listId });
             if (!item) { return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' }); }
             const oldCompletedStatus = item.completed;
             item.completed = !item.completed;
             await item.save();
             const itemToSend = { ...item.toObject(), listId: listIdStr };

             // Log item toggle
             logAction({
                  userId: user._id, username: user.username,
                  actionType: 'ITEM_TOGGLE', targetType: 'ITEM', targetId: itemId.toString(),
                  details: { listId: listIdStr, itemName: item.name, oldStatus: oldCompletedStatus, newStatus: item.completed }
             });

             io.to(listIdStr).emit('itemUpdated', itemToSend);
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error toggling item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to toggle item: ' + error.message, code: 'DB_ERROR' });
         }
     });

     socket.on('deleteItem', async ({ listId, itemId }, callback) => {
         try { // <-- try block starts here
             if (!mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid item ID', code: 'INVALID_ID' }); }
             const list = await checkListAccess(listId);
             if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
             const listIdStr = listId.toString();
             const itemIdStr = itemId.toString();
             const item = await Item.findOneAndDelete({ _id: itemId, listId: listId }).select('name').lean(); // Get name before delete
             if (!item) {
                 console.warn(`Attempt to delete item ${itemIdStr} from list ${listIdStr} by ${user.username}, but item not found.`);
                 return callback?.({ error: 'Item not found or already deleted', code: 'ITEM_NOT_FOUND' });
             }
             // Log item deletion
             logAction({
                 userId: user._id, username: user.username,
                 actionType: 'ITEM_DELETE', targetType: 'ITEM', targetId: itemIdStr,
                 details: { listId: listIdStr, deletedItemName: item.name }
             });
             io.to(listIdStr).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr });
             callback?.({ success: true, itemId: itemIdStr });
         } // <-- try block ends here, NO catch block follows
         catch (error) { // <--- THIS IS WHAT'S NEEDED
            console.error(`Error deleting item ${itemId} by ${user.username}:`, error);
            callback?.({ error: 'Failed to delete item: ' + error.message, code: 'DB_ERROR' });
         } // <--- END OF NEEDED CATCH BLOCK
     });

    // --- Item Comment Event ---
    socket.on('updateItemComment', async ({ listId, itemId, comment }, callback) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(itemId)) { return callback?.({ error: 'Invalid list or item ID', code: 'INVALID_ID' }); }
            if (typeof comment !== 'string') { return callback?.({ error: 'Invalid comment format', code: 'INVALID_COMMENT' }); }
             const trimmedComment = comment.trim();
             if (trimmedComment.length > 500) { return callback?.({ error: 'Comment too long (max 500)', code: 'COMMENT_TOO_LONG' }); }

            const list = await checkListAccess(listId);
            if (!list) { return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' }); }
            const listIdStr = listId.toString();

            const item = await Item.findOne({ _id: itemId, listId: listId });
            if (!item) { return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' }); }

            const oldComment = item.comment;
            item.comment = trimmedComment;
            await item.save();

            // Log comment update (only if changed)
            if (oldComment !== trimmedComment) {
                logAction({
                     userId: user._id, username: user.username,
                     actionType: 'ITEM_COMMENT_UPDATE', targetType: 'ITEM', targetId: itemId.toString(),
                     details: { listId: listIdStr, itemName: item.name, oldComment: oldComment, newComment: trimmedComment }
                });
            }

            const itemToSend = { ...item.toObject(), listId: listIdStr };
            io.to(listIdStr).emit('itemUpdated', itemToSend);
            console.log(`Comment updated for item ${itemId} in list ${listIdStr} by ${user.username}`);
            callback?.({ success: true, item: itemToSend });

        } catch (error) {
            console.error(`Error updating comment for item ${itemId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to update comment: ' + error.message, code: 'DB_ERROR' });
        }
    });


    // --- Room Management ---
    socket.on('joinList', async (listId) => { const list = await checkListAccess(listId); if(list) { const listIdStr = listId.toString(); console.log(`User ${user.username} (Socket: ${socket.id}) joining room for list: ${listIdStr}`); socket.join(listIdStr); socket.join(user._id.toString()); } else { console.warn(`User ${user.username} denied joining room for list ${listId} (no access).`) } });
    socket.on('leaveList', (listId) => { if (listId && typeof listId === 'string') { console.log(`User ${user.username} (Socket: ${socket.id}) leaving room for list: ${listId}`); socket.leave(listId); } else { console.warn(`User ${user.username} sent invalid leaveList request for ID: ${listId}`); } });
    // --- Disconnect ---
    socket.on('disconnect', (reason) => { const username = socket.request.user?.username || '(Unknown: Auth failed?)'; console.log(`User disconnected: ${username} (Socket ID: ${socket.id}). Reason: ${reason}`); });
});


// --- Serve Frontend Statically in Production ---
if (process.env.NODE_ENV === 'production') { const clientBuildPath = path.resolve(__dirname, '../client/dist'); console.log(`Production mode: Serving static files from: ${clientBuildPath}`); app.use(express.static(clientBuildPath)); app.get('*', (req, res) => { res.sendFile(path.resolve(clientBuildPath, 'index.html')); }); }
else { app.get('/', (req, res) => { res.send("API is running in development mode..."); }); }

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT}`); console.log(`Client expected at: ${CLIENT_ORIGIN || 'http://localhost:5173 (default)'}`); if(!ADMIN_PIN_HASH) { console.warn('\x1b[33m%s\x1b[0m', 'WARN: ADMIN_PIN is not set. Admin panel verification will not work.'); } });