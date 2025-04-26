// server/server.js
// Description: Backend server using Express and Socket.IO. Handles API requests,
// WebSocket connections, authentication, database interactions (MongoDB/Mongoose),
// and real-time updates for the shopping list application. Includes action logging.
// ** CRITICAL FIX: Corrected syntax error `}); } try {` in delete list handler. **
// ** ADDED: GET /api/users endpoint to fetch list of users for sharing. **
// ** ADDED: updateListAllowedUsers Socket.IO handler to update list sharing. **
// ** ADDED: LIST_SHARING_UPDATE Action Type. **
// ** IMPROVED: emitListDelete targets users more specifically. **
// ** FIX: Meticulously reviewed and corrected ALL route handler closing syntaxes (ensure ends with ); ). **
// ** FIX: Ensured incorrect listId validation is removed from /api/admin/logs handler. **
// ** FIX: Verified main io.on('connection') block is correctly closed. **
// ** OPTIMIZED: Modified /api/lists to NOT fetch items initially. Items are now fetched on demand via /api/lists/:listId/items. **
// ** IMPROVED: Reduced verbose console logging for cleaner output. **
// ** MODIFIED: Added quantityValue and quantityUnit to Item model and handling **


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
const ShoppingList = require('./models/ShoppingList'); // Ensure this model has indexes for owner, isPublic, allowedUsers
const Item = require('./models/Item'); // Ensure this model has an index for listId
const User = require('./models/User');
const { LogEntry, ACTION_TYPES, TARGET_TYPES } = require('./models/LogEntry'); // Import Log model and enums
// Assuming ACTION_TYPES includes LIST_SHARING_UPDATE now:
// const ACTION_TYPES = { ..., LIST_SHARING_UPDATE: 'LIST_SHARING_UPDATE' };


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
if (!CLIENT_ORIGIN) { console.warn("WARN: CORS_ORIGIN is not defined. Allowing any origin (not recommended for production)."); }
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET is not defined."); process.exit(1); }
if (!ADMIN_PIN_HASH && process.env.NODE_ENV !== 'production') { console.warn('\x1b[33m%s\x1b[0m', 'WARN: ADMIN_PIN is not set. Admin panel verification will not work.'); }


// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
// Use an array if CLIENT_ORIGIN is a single string, otherwise properly handle multiple origins
const originsConfig = () => {
    // If wildcard is set, just return it
    if (CLIENT_ORIGIN === '*') return '*';
    
    // Define all valid origins including GitHub dev URLs
    const validOrigins = [
        CLIENT_ORIGIN,
        'https://humble-lamp-g446w4v9v7j4h9p7p-5173.app.github.dev',
        'https://humble-lamp-g446w4v9-3.app.github.dev', // Include variations seen in error logs
        'https://humble-lamp-g446w4v9-5173.app.github.dev',
        'http://localhost:5173' // For local development
    ].filter(Boolean); // Filter out undefined/empty values
    
    // Return function to dynamically check origin
    return function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        // Check if the origin is in our allowed list
        if (validOrigins.indexOf(origin) !== -1 || validOrigins.includes('*')) {
            return callback(null, true);
        }
        
        // Log the blocked origin for debugging
        console.log(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    };
};

const corsOptions = {
    origin: originsConfig(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions)); // Apply CORS middleware
app.use(express.json()); // Body parsing for JSON requests
app.use(cookieParser()); // Cookie parsing
app.set('trust proxy', 1); // Needed for req.ip behind a proxy like Render or Heroku


// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => { console.error('MongoDB Connection Error:', err); process.exit(1); }); // Exit process on connection failure


// --- Socket.IO Setup ---
const io = new Server(server, { cors: corsOptions });

// --- Socket.IO Authentication Middleware ---
// This middleware runs for every new socket connection attempt.
io.use(async (socket, next) => {
    let token = null;
    // 1. Check for token in cookies
    const cookies = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie) : {};
    token = cookies[COOKIE_NAME];
    // 2. If not in cookies, check auth payload (used by some clients or for specific auth flows)
    if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
    }

    if (!token) {
        // console.warn('Socket connection blocked: No token provided.'); // Reduce log verbosity
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) {
             console.warn('Socket connection blocked: Invalid token format.'); // Reduce log verbosity
            return next(new Error('Authentication error: Invalid token'));
        }

        // Find the user based on the decoded token ID
        const user = await User.findById(decoded.id).select('username isAdmin _id').lean();

        if (!user) {
            console.warn(`Socket connection blocked: User ID ${decoded.id} from token not found.`); // Reduce log verbosity
            return next(new Error('Authentication error: User not found'));
        }

        // Attach user object to socket request for use in subsequent handlers
        socket.request.user = user;
        // console.log(`Socket connection authenticated for user: ${user.username}`); // Reduce log verbosity
        next(); // Authentication successful
    } catch (error) {
         // Handle token verification errors (invalid signature, expired)
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             console.warn(`Socket connection blocked: Invalid or expired token.`, error.message); // Reduce log verbosity
            next(new Error('Authentication error: Invalid or expired token'));
        } else {
            // Handle other potential errors (e.g., database issues during user lookup)
            console.error('Socket authentication server error:', error); // Keep error logs
            next(new Error('Authentication error: Server error during verification'));
        }
    }
});


// ========== API Routes ==========

// --- Authentication Routes ---
app.post('/api/auth/login', protect, async (req, res) => {
    const { username, pin } = req.body;
    const ipAddress = req.ip;
    if (!username || !pin) {
        return res.status(400).json({ message: 'Please provide username and PIN' });
    }
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (user && (await user.comparePin(pin))) {
            const token = generateToken(user._id, user.username, user.isAdmin);
            setTokenCookie(res, token);
            logAction({ userId: user._id, username: user.username, actionType: ACTION_TYPES.USER_LOGIN_SUCCESS, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress, details: { username: user.username } });
            res.json({ _id: user._id, username: user.username, isAdmin: user.isAdmin });
        } else {
            logAction({ actionType: ACTION_TYPES.USER_LOGIN_FAIL, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress, details: { attemptedUsername: username.toLowerCase() } });
            res.status(401).json({ message: 'Invalid username or PIN' });
        }
    } catch (error) {
        console.error("Login error:", error);
        logAction({ actionType: ACTION_TYPES.USER_LOGIN_FAIL, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress, details: { attemptedUsername: username.toLowerCase(), error: error.message } });
        res.status(500).json({ message: 'Server error during login' });
    }
} ); // Correct closing parenthesis and semicolon

app.post('/api/auth/logout', protect, (req, res) => { const ipAddress = req.ip; logAction({ userId: req.user._id, username: req.user.username, actionType: ACTION_TYPES.USER_LOGOUT, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress }); clearTokenCookie(res); res.status(200).json({ message: 'Logged out successfully' }); } );
app.get('/api/auth/session', protect, (req, res) => { res.json({ _id: req.user._id, username: req.user.username, isAdmin: req.user.isAdmin }); } );

// GET /api/users - Fetches a list of all users (excluding the current user)
app.get('/api/users', protect, async (req, res) => {
    try {
        const currentUserId = req.user._id;
        // Find all users except the current one, selecting only necessary fields
        const users = await User.find({ _id: { $ne: currentUserId } })
            .select('username _id')
            .sort({ username: 1 }) // Sort alphabetically by username
            .lean(); // Return plain objects

        res.json(users);
    } catch (error) {
        console.error("Error fetching all users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
} );

// GET /api/users/search - Fetches users whose username starts with a query
app.get('/api/users/search', protect, async (req, res) => { const query = req.query.q || ''; const currentUserId = req.user._id; if (!query) { return res.json([]); } try { // Find users whose username starts with the query (case-insensitive) and are not the current user
        const users = await User.find({ username: { $regex: `^${query}`, $options: 'i' }, _id: { $ne: currentUserId } }).select('username _id').limit(10).lean();
        res.json(users); } catch (error) { console.error("Error searching users:", error); res.status(500).json({ message: "Error searching users" }); } } );

// Authentication check endpoint - returns user data if authenticated
app.get('/api/auth/check', protect, async (req, res) => {
    try {
        // If protect middleware passes, user is authenticated
        // req.user should be populated by the protect middleware
        const user = await User.findById(req.user._id).select('-pin');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Log this authentication check
        logAction({ 
            userId: user._id, 
            username: user.username, 
            actionType: ACTION_TYPES.AUTH_CHECK, 
            targetType: TARGET_TYPES.AUTH, 
            ipAddress: req.ip 
        });
        
        // Return user data (similar to session endpoint)
        res.json({ 
            user: {
                _id: user._id, 
                username: user.username, 
                isAdmin: user.isAdmin
            } 
        });
    } catch (error) {
        console.error("Auth check error:", error);
        res.status(500).json({ message: 'Server error during authentication check' });
    }
});

// --- Standard Shopping List Routes ---

// GET /api/lists - Fetches list metadata (WITHOUT ITEMS)
// This is optimized for the initial load of the lists screen.
app.get('/api/lists', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        // Find lists where the user is the owner, or the list is public, or the user is in allowedUsers.
        // Populate owner and allowedUsers for display on the list screen.
        const lists = await ShoppingList.find({
            $or: [
                { owner: userId },
                { isPublic: true },
                { allowedUsers: userId }
            ]
        })
        .populate('owner', 'username _id') // Populate owner details
        .populate('allowedUsers', 'username _id') // Populate allowed users details
        .select('-items') // Explicitly exclude the items field (even though it's not a direct field, ensures clarity)
        .sort({ name: 1 }) // Sort lists by name
        .lean(); // Return plain JavaScript objects for better performance

        // Note: Items are *not* fetched here. The client will fetch items for a specific list via /api/lists/:listId/items
        res.json(lists);
    } catch (error) {
        console.error("Error fetching lists metadata:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
} );

// GET /api/lists/:listId/items - Fetches items for a SINGLE list
// Used by the client when a list is selected for detail view.
app.get('/api/lists/:listId/items', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const listId = req.params.listId;

        // Validate listId format
        if (!mongoose.Types.ObjectId.isValid(listId)) {
            return res.status(400).json({ message: 'Invalid list ID format' });
        }

        // Check if the user has access to this specific list (owner, public, or allowedUser)
        const list = await ShoppingList.findOne({
            _id: listId,
            $or: [
                { owner: userId },
                { isPublic: true },
                { allowedUsers: userId }
            ]
        }).select('_id owner isPublic allowedUsers').lean(); // Fetch minimal list data to check access

        if (!list) {
            // Log access attempt for better security monitoring
            logAction({
                userId: userId, username: req.user.username,
                actionType: ACTION_TYPES.ACCESS_DENIED, targetType: TARGET_TYPES.LIST, targetId: listId,
                details: { message: 'Attempted to fetch items for list not found or access denied' }
            });
            return res.status(403).json({ message: 'List not found or access denied' });
        }

        // Fetch items belonging to this list, sorted by creation date
        const items = await Item.find({ listId: listId })
                                .select('name completed comment quantityValue quantityUnit createdAt updatedAt')
                                .sort({ createdAt: 1 })
                                .lean(); // Return plain JavaScript objects

        res.json(items);
    } catch (error) {
        console.error(`Error fetching items for list ${req.params.listId} by user ${req.user.username}:`, error);
        res.status(500).json({ message: 'Error fetching items' });
    }
} );


// ========== ADMIN API Routes ==========
// Rewriting verify-pin for clearer try/catch structure and corrected closing syntax
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => {
    const { pin } = req.body;
    const ipAddress = req.ip;
    const adminUser = req.user;

    if (!ADMIN_PIN_HASH) {
        console.error("Admin PIN not configured."); // Log error server-side
        return res.status(500).json({ message: "Admin PIN not configured on server." });
    }
    if (!pin) {
        return res.status(400).json({ message: "PIN is required." });
    }

    try {
        const isMatch = await bcrypt.compare(pin, ADMIN_PIN_HASH);
        if (isMatch) {
            logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_PIN_VERIFY_SUCCESS, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress });
            res.status(200).json({ message: "Admin PIN verified." });
        } else {
            logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_PIN_VERIFY_FAIL, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress });
            res.status(401).json({ message: "Invalid Admin PIN." });
        }
    } catch (error) {
        console.error("Admin PIN check error:", error); // Keep error logs
        logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_PIN_VERIFY_FAIL, targetType: TARGET_TYPES.AUTH, ipAddress: ipAddress, details: { error: error.message } });
        res.status(500).json({ message: 'Server error verifying admin PIN' });
    }
} ); // Correct closing syntax

app.get('/api/admin/users', protect, adminProtect, async (req, res) => { try { const users = await User.find().select('-hashedPin -__v').sort({ username: 1 }).lean(); res.json(users); } catch (error) { console.error("Admin: Error fetching users:", error); res.status(500).json({ message: 'Error fetching users' }); } } );
app.post('/api/admin/users', protect, adminProtect, async (req, res) => { const { username, pin } = req.body; const adminUser = req.user; if (!username || typeof username !== 'string' || username.trim().length < 3) { return res.status(400).json({ message: 'Username must be at least 3 characters long' }); } if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) { return res.status(400).json({ message: 'PIN must be exactly 4 digits' }); } const cleanUsername = username.toLowerCase().trim(); try { const existingUser = await User.findOne({ username: cleanUsername }); if (existingUser) { return res.status(400).json({ message: 'Username already exists' }); } const hashedPin = await User.hashPin(pin); const newUser = new User({ username: cleanUsername, hashedPin: hashedPin, isAdmin: false }); await newUser.save(); logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_USER_CREATE, targetType: TARGET_TYPES.USER, targetId: newUser._id.toString(), details: { createdUsername: newUser.username } }); const userToReturn = newUser.toObject(); delete userToReturn.hashedPin; delete userToReturn.__v; res.status(201).json(userToReturn); } catch (error) { console.error("Admin: Error adding user:", error); if (error.code === 11000) { return res.status(400).json({ message: 'Username already exists' }); } res.status(500).json({ message: 'Error adding user' }); } } );

// Rewriting delete user for clearer try/catch structure and corrected closing syntax
app.delete('/api/admin/users/:userId', protect, adminProtect, async (req, res) => {
    const { userId } = req.params;
    const adminUser = req.user;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID format' });
    }
    if (userId === adminUser._id.toString()) {
        return res.status(400).json({ message: 'Admin cannot delete themselves' });
    }

    try {
        const userToDelete = await User.findById(userId).select('username').lean();
        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find and delete lists owned by the user and their items
        const listsToDelete = await ShoppingList.find({ owner: userId }).select('_id').lean();
        const listIdsToDelete = listsToDelete.map(list => list._id);

        if (listIdsToDelete.length > 0) {
            await Item.deleteMany({ listId: { $in: listIdsToDelete } });
            console.log(`Admin: Deleted items from ${listIdsToDelete.length} lists owned by user ${userId}`);
            await ShoppingList.deleteMany({ _id: { $in: listIdsToDelete } });
            console.log(`Admin: Deleted ${listIdsToDelete.length} lists owned by user ${userId}`);
        }

        // Delete the user
        await User.findByIdAndDelete(userId);
        console.log(`Admin: Deleted user ${userId}`);

        // Remove user from allowedUsers arrays in other lists
        await ShoppingList.updateMany(
            { allowedUsers: userId },
            { $pull: { allowedUsers: userId } }
        );

        logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_USER_DELETE, targetType: TARGET_TYPES.USER, targetId: userId, details: { deletedUsername: userToDelete.username } });

        res.status(200).json({ message: 'User and associated data deleted successfully' });
    } catch (error) {
        console.error(`Admin: Error deleting user ${userId}:`, error); // Keep error logs
        res.status(500).json({ message: 'Error deleting user' });
    }
} ); // Correct closing syntax

app.get('/api/admin/lists', protect, adminProtect, async (req, res) => {
    const { userId, privacy } = req.query;
    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) { filter.userId = userId; }
    if (privacy === 'public') { filter.isPublic = true; } else if (privacy === 'private') { filter.isPublic = false; }
    try {
        // Fetch lists based on filters
        const lists = await ShoppingList.find(filter)
            .populate('owner', 'username _id')
            .populate('allowedUsers', 'username _id')
            .sort({ createdAt: -1 })
            .lean();

        // For admin view, we *do* fetch items to display count/details if needed, but can optimize this later if performance is an issue here.
        // Current implementation fetches all items for all lists returned by the filter.
        const listsWithItems = await Promise.all(lists.map(async (list) => {
            const items = await Item.find({ listId: list._id })
                                    .select('name completed comment quantityValue quantityUnit')
                                    .lean();
            return { ...list, items: items };
        }));
        res.json(listsWithItems);
    } catch (error) {
        console.error("Admin: Error fetching lists:", error);
        res.status(500).json({ message: 'Error fetching lists' });
    }
} );

// Corrected the syntax error on line 370 within this block.
app.delete('/api/admin/lists/:listId', protect, adminProtect, async (req, res) => {
    const { listId } = req.params;
    const adminUser = req.user;

    if (!mongoose.Types.ObjectId.isValid(listId)) {
        return res.status(400).json({ message: 'Invalid list ID format' });
    }
    // CRITICAL FIX: Corrected syntax here
    try {
        const listToDelete = await ShoppingList.findById(listId).select('name').lean();
        if (!listToDelete) {
            return res.status(404).json({ message: 'List not found' });
        }
        // Delete items associated with the list
        const deleteItemsResult = await Item.deleteMany({ listId: listId });
        console.log(`Admin (${adminUser.username}): Deleted ${deleteItemsResult.deletedCount} items from list ${listId}`);
        // Delete the list itself
        await ShoppingList.findByIdAndDelete(listId);
        console.log(`Admin (${adminUser.username}): Deleted list ${listId}`);
        // Log the action
        logAction({ userId: adminUser._id, username: adminUser.username, actionType: ACTION_TYPES.ADMIN_LIST_DELETE, targetType: TARGET_TYPES.LIST, targetId: listId, details: { deletedListName: listToDelete.name } });
        // Notify relevant clients via socket (clients in this list's room, or owner/allowed)
        // We can emit a simple delete event here now.
        io.emit('listDeleted', listId); // Emit to all clients (client handles if they care about this ID)
        // Force clients in the list room to leave
        io.sockets.sockets.forEach(s => { if (s.rooms.has(listId.toString())) { s.leave(listId.toString()); } });
        res.status(200).json({ message: 'List and associated items deleted successfully' });
    } catch (error) {
        console.error(`Admin (${adminUser.username}): Error deleting list ${listId}:`, error);
        res.status(500).json({ message: 'Server error deleting list' });
    }
} ); // Correct closing syntax

// Corrected closing syntax ); for the /api/admin/logs GET route, and removed incorrect listId check
app.get('/api/admin/logs', protect, adminProtect, async (req, res) => {
    try {
        // Destructure query parameters
        const { userId, actionType, targetType, dateStart, dateEnd, sortBy = 'timestamp', sortOrder = 'desc', page = 1, limit = 50 } = req.query;

        const filter = {};
        // Filter by user ID if provided and valid
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            filter.userId = userId;
        }
        // Filter by action type if provided and valid
        if (actionType && ACTION_TYPES.includes(actionType)) {
            filter.actionType = actionType;
        }
        // Filter by target type if provided and valid
        if (targetType && TARGET_TYPES.includes(targetType)) {
            filter.targetType = targetType;
        }

        // Filter by date range if provided
        if (dateStart || dateEnd) {
            filter.timestamp = {};
            if (dateStart) {
                const startDate = new Date(dateStart);
                if (!isNaN(startDate.getTime())) filter.timestamp.$gte = startDate;
            }
            if (dateEnd) {
                const endDate = new Date(dateEnd);
                if (!isNaN(endDate.getTime())) {
                    // End date typically means up to the *end* of that day. Add 24 hours.
                    endDate.setDate(endDate.getDate() + 1);
                    filter.timestamp.$lt = endDate;
                }
            }
        }

        // Pagination
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Sorting options
        const sortOptions = {};
        if (sortBy === 'timestamp' || sortBy === 'username' || sortBy === 'actionType') {
            sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
        } else {
            // Default sort by timestamp descending
            sortOptions['timestamp'] = -1;
        }

        // Fetch logs with pagination and sorting
        const logs = await LogEntry.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'username') // Populate user details for the log entry
            .lean(); // Return plain JavaScript objects

        // Get total count for pagination info
        const totalLogs = await LogEntry.countDocuments(filter);
        const totalPages = Math.ceil(totalLogs / limitNum);

        res.json({ logs: logs, currentPage: pageNum, totalPages: totalPages, totalLogs: totalLogs, limit: limitNum });

    } catch (error) {
        console.error("Admin: Error fetching logs:", error);
        res.status(500).json({ message: 'Error fetching activity logs' });
    }
} ); // Correct closing parenthesis and semicolon for app.get


// ========== Socket.IO Event Handlers ==========
// This is the main connection handler.
io.on('connection', (socket) => {
    const user = socket.request.user; // User object attached by auth middleware
    // If user is null, middleware failed authentication and next(error) was called,
    // which should disconnect the socket. This check is a safeguard.
    if(!user) {
        // console.warn('Attempted connection by unauthenticated socket ID: ${socket.id}'); // Reduce log verbosity
        socket.disconnect(true);
        return;
    }
    console.log(`User connected: ${user.username} (Socket ID: ${socket.id})`);

    // Automatically join a user-specific room for direct messages (like listsUpdated for private lists)
    socket.join(user._id.toString());
    // console.log(`User ${user.username} joined room: ${user._id.toString()}`); // Reduce verbosity


    // --- Helper Functions within Socket Scope ---
    // Check if user has read access to a list
    const checkListAccess = async (listId, projection = '_id owner isPublic allowedUsers') => {
        if (!mongoose.Types.ObjectId.isValid(listId)) {
            // console.warn(`Invalid list ID format received from ${user.username}: ${listId}`); // Reduce verbosity
            return null;
        }
        try {
            const list = await ShoppingList.findOne({
                _id: listId,
                $or: [
                    { owner: user._id },
                    { isPublic: true },
                    { allowedUsers: user._id }
                ]
            }).select(projection).lean();
            // if (!list) { console.warn(`Access denied for user ${user.username} on list ${listId}`); } // Reduce verbosity
            return list;
        } catch (error) {
            console.error(`Database error checking access for user ${user.username} on list ${listId}:`, error); // Keep error logs
            return null;
        }
    };

    // Check if user owns a list
    const checkListOwnership = async (listId) => {
        if (!mongoose.Types.ObjectId.isValid(listId)) return null;
        try {
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id }).select('_id').lean();
            // if (!list) { console.warn(`Ownership denied for user ${user.username} on list ${listId}`); } // Reduce verbosity
            return list;
        } catch (error) {
            console.error(`Database error checking ownership for user ${user.username} on list ${listId}:`, error); // Keep error logs
            return null;
        }
    };

    // Emit a listsUpdated event for a specific list to relevant clients
    // This helper fetches the list with owner, allowed users, and items and emits it.
    const emitListUpdate = async (listId) => {
        try {
            // Fetch the updated list with owner, allowedUsers, AND items
            const updatedList = await ShoppingList.findById(listId)
                .populate('owner', 'username _id')
                .populate('allowedUsers', 'username _id')
                .lean();

            if (!updatedList) {
                console.warn(`Attempted to emit update for non-existent list ${listId}`); // Keep this warning
                return;
            }

            // Fetch items for this specific list
            const items = await Item.find({ listId: listId })
                .select('name completed comment quantityValue quantityUnit createdAt updatedAt')
                .sort({ createdAt: 1 })
                .lean();
            updatedList.items = items; // Attach items to the list object

            const listIdStr = listId.toString();

            // Emit to everyone in the list's room (users currently viewing the list)
            io.to(listIdStr).emit('listsUpdated', updatedList);
            // console.log(`Emitted listsUpdated to room: ${listIdStr}`); // Reduce verbosity

            // Also emit directly to the owner and allowed users (if private) if they are not in the room
            // This is important for showing list metadata updates on the main lists view.
            if (!updatedList.isPublic) {
                 const ownerIdStr = updatedList.owner._id.toString();
                 // Emit to owner's personal room
                 io.to(ownerIdStr).emit('listsUpdated', updatedList);
                 // console.log(`Emitted listsUpdated to owner room: ${ownerIdStr}`); // Reduce verbosity

                 updatedList.allowedUsers.forEach(allowedUser => {
                     const allowedUserIdStr = allowedUser._id.toString();
                     // Don't double-emit if owner is also in allowedUsers (shouldn't happen with current logic)
                     if (allowedUserIdStr !== ownerIdStr) {
                         io.to(allowedUserIdStr).emit('listsUpdated', updatedList);
                         // console.log(`Emitted listsUpdated to allowed user room: ${allowedUserIdStr}`); // Reduce verbosity
                     }
                 });
             } else {
                 // If the list became public, notify all connected clients (they might now see it in their list view)
                 // This sends the full list object which might be larger, but ensures consistency.
                 // A lighter-weight event could be considered later if this is a perf issue.
                  console.log(`List ${listIdStr} is public, emitting listsUpdated to all clients.`);
                  io.emit('listsUpdated', updatedList); // Emit to all connected clients
             }
        } catch (error) {
            console.error(`Error fetching/emitting update for list ${listId}:`, error); // Keep error logs
        }
    };

    // Emit a listDeleted event for a specific list to relevant clients
     const emitListDelete = async (listId) => {
         if (!mongoose.Types.ObjectId.isValid(listId)) return;
         const listIdStr = listId.toString();

         try {
              // Fetch the list *before* deleting it to know who to notify
              const listToDeleteDetails = await ShoppingList.findById(listId).select('owner allowedUsers isPublic').lean();

             // If the list was found (meaning it existed just before deletion)
             if (listToDeleteDetails) {
                 const ownerIdStr = listToDeleteDetails?.owner?._id.toString();
                 const allowedUserIds = listToDeleteDetails?.allowedUsers?.map(u => u._id.toString()) || [];

                 // Emit delete event to everyone in the list room (users currently viewing it)
                 io.to(listIdStr).emit('listDeleted', listIdStr);
                 console.log(`Emitted listDeleted to room: ${listIdStr}`); // Keep this log

                 // If not public, also emit to owner and allowed users' personal rooms
                 // This ensures they see the list removed from their main lists view.
                 if (!listToDeleteDetails?.isPublic) {
                     if (ownerIdStr) {
                          io.to(ownerIdStr).emit('listDeleted', listIdStr);
                          console.log(`Emitted listDeleted to owner room: ${ownerIdStr}`); // Keep this log
                     }
                     allowedUserIds.forEach(userId => {
                         if (userId !== ownerIdStr) { // Avoid double-emitting to owner
                              io.to(userId).emit('listDeleted', listIdStr);
                             console.log(`Emitted listDeleted to allowed user room: ${userId}`); // Keep this log
                         }
                     });
                 } else {
                     // If it was public, anyone *might* have seen it. Emitting to all is safer but less efficient.
                     // The `listDeleted` event is light weight (just ID), so maybe emitting to all for public lists is acceptable.
                      console.log(`List ${listIdStr} was public, emitting listDeleted to all clients.`);
                      io.emit('listDeleted', listIdStr); // Emit to all connected clients
                 }

                 // Force clients in the list room to leave
                io.sockets.sockets.forEach(s => {
                    if (s.rooms.has(listIdStr)) {
                        s.leave(listIdStr);
                        // console.log(`Socket ${s.id} force-left room ${listIdStr} after deletion.`); // Reduce verbosity
                    }
                });

             } else {
                  console.warn(`emitListDelete called for list ${listIdStr} but list not found (already deleted?).`); // Keep warning
                  // Still emit to the room just in case someone was in it when it disappeared
                  io.to(listIdStr).emit('listDeleted', listIdStr);
                  io.sockets.sockets.forEach(s => { // Also try to force leave
                      if (s.rooms.has(listIdStr)) s.leave(listIdStr);
                  });
             }

         } catch (error) {
             console.error(`Error fetching list details for emitListDelete for ${listIdStr}:`, error); // Keep error logs
              // Fallback: Emit to all clients as a failsafe
              io.emit('listDeleted', listIdStr);
         }
    };


    // --- Socket.IO Event Listeners ---

    // User joins a list room to receive real-time updates for that specific list
    socket.on('joinList', async (listId) => {
        if (typeof listId !== 'string') {
            console.warn(`Invalid list ID type received for joinList from ${user.username}: ${listId}`);
            return;
        }
        const list = await checkListAccess(listId);
        if (list) {
            const listIdStr = listId.toString();
            // Check if the socket is already in the room
            if (!socket.rooms.has(listIdStr)) {
                 console.log(`User ${user.username} (Socket: ${socket.id}) joining room for list: ${listIdStr}`); // Keep this log
                 socket.join(listIdStr);
            } else {
                 // console.log(`User ${user.username} (Socket: ${socket.id}) is already in room for list: ${listIdStr}`); // Reduce verbosity
            }
        } else {
            console.warn(`User ${user.username} denied joining room for list ${listId} (no access or not found).`) // Keep this warning
            // Optionally emit an error or force client back to lists view
            socket.emit('listAccessDenied', listId); // Custom event for access denied
        }
    });

    // User leaves a list room
    socket.on('leaveList', (listId) => {
        if (listId && typeof listId === 'string') {
             // Check if the socket is actually in the room before leaving
            if (socket.rooms.has(listId)) {
                 console.log(`User ${user.username} (Socket: ${socket.id}) leaving room for list: ${listId}`); // Keep this log
                 socket.leave(listId);
            } else {
                 // console.log(`User ${user.username} (Socket: ${socket.id}) not in room for list: ${listId}, no need to leave.`); // Reduce verbosity
            }
        } else {
             console.warn(`User ${user.username} sent invalid leaveList request for ID: ${listId}`); // Keep this warning
        }
    });

    // --- List Events ---
    socket.on('addList', async ({ name, isPublic }, callback) => {
        try {
            // Basic input validation
            if (!name || typeof name !== 'string' || name.trim().length === 0) { return callback?.({ error: 'List name cannot be empty', code: 'INVALID_NAME' }); }
            if (name.length > 100) { return callback?.({ error: 'List name too long (max 100)', code: 'NAME_TOO_LONG' }); }

            // Create new list
            const newList = new ShoppingList({
                name: name.trim(),
                owner: user._id,
                isPublic: !!isPublic, // Ensure boolean
                allowedUsers: [] // Start with empty allowed users
            });
            await newList.save(); // Save to database

            // Populate owner for the response and socket emission
            const populatedList = await ShoppingList.findById(newList._id).populate('owner', 'username _id').lean();
            populatedList.items = []; // New lists have no items initially

            const listIdStr = populatedList._id.toString();
            console.log(`List '${populatedList.name}' (ID: ${listIdStr}) added by user ${user.username}`); // Keep this log

            // Log the action
            logAction({
                userId: user._id, username: user.username,
                actionType: ACTION_TYPES.LIST_CREATE, targetType: TARGET_TYPES.LIST, targetId: listIdStr,
                details: { listName: populatedList.name, isPublic: populatedList.isPublic }
            });

            // Emit update: Send the new list metadata to the owner's personal room
            // Client side will add this new list to their list view.
             io.to(user._id.toString()).emit('listsUpdated', populatedList);

            // Automatically join the list room for the client that created it
             // Client should also request joinList, but server joining is safer.
             socket.join(listIdStr);
             // console.log(`User ${user.username} automatically joined room for new list: ${listIdStr}`); // Reduce verbosity


            callback?.({ success: true, newList: populatedList }); // Respond to the client
        } catch (error) {
            console.error(`Error adding list for user ${user.username}:`, error); // Keep error logs
            callback?.({ error: 'Failed to add list: ' + error.message, code: 'DB_ERROR' }); // Respond with error
        }
    });

    socket.on('deleteList', async (listId, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        try {
            // Validate ID format
            if (!mongoose.Types.ObjectId.isValid(listId)) {
                 console.warn(`Invalid list ID format received for deleteList from ${user.username}: ${listId}`); // Keep this warning
                return callback?.({ error: 'Invalid list ID', code: 'INVALID_ID' });
            }
            listIdStr = listId.toString();

            // Check ownership before deleting
            const list = await checkListOwnership(listId);
            if (!list) {
                 console.warn(`User ${user.username} attempted delete on list ${listIdStr} they don't own or doesn't exist.`); // Keep this warning
                return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' });
            }

            // Store info needed for logging/emitting *before* deleting
             const listToDeleteDetails = await ShoppingList.findById(listId).select('name owner allowedUsers isPublic').lean();
             // console.log(`List details before deletion for ${listIdStr}:`, listToDeleteDetails); // Debugging log

            // Delete all items within the list
            await Item.deleteMany({ listId: listId });
            // Delete the list itself
            await ShoppingList.findByIdAndDelete(listId);

            console.log(`List ${listIdStr} deleted by owner ${user.username}`); // Keep this log

            // Log the action
            logAction({
                userId: user._id, username: user.username,
                actionType: ACTION_TYPES.LIST_DELETE, targetType: TARGET_TYPES.LIST, targetId: listIdStr,
                 details: { listName: listToDeleteDetails?.name || 'Unknown' }
            });

            // Emit delete event to relevant clients (uses the pre-delete list info)
            await emitListDelete(listId); // Call the helper to send targeted deletes


            callback?.({ success: true }); // Respond to client
        } catch (error) {
            console.error(`Error deleting list ${listIdStr} for user ${user.username}:`, error); // Keep error logs
            callback?.({ error: 'Failed to delete list: ' + error.message, code: 'DB_ERROR' }); // Respond with error
        }
    });

    socket.on('toggleListPrivacy', async (listId, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        try {
            // Validate ID format
            if (!mongoose.Types.ObjectId.isValid(listId)) {
                 console.warn(`Invalid list ID format received for togglePrivacy from ${user.username}: ${listId}`); // Keep this warning
                return callback?.({ error: 'Invalid list ID', code: 'INVALID_ID' });
            }
            listIdStr = listId.toString();

            // Find the list and check ownership
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
            if (!list) {
                 console.warn(`User ${user.username} attempted togglePrivacy on list ${listIdStr} they don't own or doesn't exist.`); // Keep this warning
                return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' });
            }

            const oldPrivacy = list.isPublic;
            list.isPublic = !list.isPublic; // Toggle privacy
            await list.save(); // Save changes

            console.log(`List ${listIdStr} privacy toggled to ${list.isPublic ? 'public' : 'private'} by owner ${user.username}`); // Keep this log

            // Log the action
            logAction({
                userId: user._id, username: user.username,
                actionType: ACTION_TYPES.LIST_PRIVACY_TOGGLE, targetType: TARGET_TYPES.LIST, targetId: listIdStr,
                details: { oldPrivacy: oldPrivacy, newPrivacy: list.isPublic, listName: list.name }
            });

            // Emit update to relevant clients (owner, allowed users, and those in the room)
            await emitListUpdate(listId); // This helper fetches the list with items and emits correctly

            callback?.({ success: true, isPublic: list.isPublic }); // Respond to client
        } catch (error) {
            console.error(`Error toggling privacy for list ${listIdStr} by ${user.username}:`, error); // Keep error logs
            callback?.({ error: 'Failed to update privacy: ' + error.message, code: 'DB_ERROR' }); // Respond with error
        }
    });

    // socket.on('inviteUserToList', ...) and socket.on('removeUserFromList', ...) are now replaced by updateListAllowedUsers

    // NEW: Handle updating the entire list of allowed users
    socket.on('updateListAllowedUsers', async ({ listId, allowedUserIds }, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        try {
            // 1. Validate Input IDs
            if (!mongoose.Types.ObjectId.isValid(listId)) {
                console.warn(`Invalid list ID format received for updateListAllowedUsers from ${user.username}: ${listId}`);
                return callback?.({ error: 'Invalid list ID format', code: 'INVALID_LIST_ID' });
            }
            listIdStr = listId.toString();

            if (!Array.isArray(allowedUserIds)) {
                 console.warn(`Invalid allowedUserIds format received for updateListAllowedUsers from ${user.username}: Must be an array.`);
                 return callback?.({ error: 'Invalid allowed users format', code: 'INVALID_USERS_ARRAY' });
            }

             // Ensure all user IDs in the array are valid ObjectIds
             const validAllowedUserIds = allowedUserIds.filter(userId => mongoose.Types.ObjectId.isValid(userId)).map(userId => new mongoose.Types.ObjectId(userId));
             if (validAllowedUserIds.length !== allowedUserIds.length) {
                 console.warn(`Invalid user ID(s) found in allowedUserIds array for updateListAllowedUsers from ${user.username}.`);
                 // Decide whether to return an error or just proceed with valid IDs.
                 // Proceeding might hide issues on the client. Returning error is safer.
                 return callback?.({ error: 'Invalid user ID(s) in the list', code: 'INVALID_USER_ID_IN_ARRAY' });
             }

            // 2. Check Ownership
            const list = await ShoppingList.findOne({ _id: listId, owner: user._id });
            if (!list) {
                console.warn(`User ${user.username} attempted updateListAllowedUsers on list ${listIdStr} they don't own or doesn't exist.`);
                return callback?.({ error: 'List not found or permission denied', code: 'ACCESS_DENIED' });
            }
             // Prevent sharing if the list is public (sharing is only for private lists)
             if (list.isPublic) {
                 console.warn(`User ${user.username} attempted updateListAllowedUsers on public list ${listIdStr}.`);
                 return callback?.({ error: 'Cannot update sharing for a public list', code: 'LIST_IS_PUBLIC' });
             }

             // 3. Perform Update
             const oldAllowedUserIds = list.allowedUsers.map(id => id.toString());
             const newAllowedUserIdsStr = validAllowedUserIds.map(id => id.toString());

             // Find users who were added vs removed for logging details
             const addedUserIds = newAllowedUserIdsStr.filter(userId => !oldAllowedUserIds.includes(userId));
             const removedUserIds = oldAllowedUserIds.filter(userId => !newAllowedUserIdsStr.includes(userId));
             const totalUsersAdded = addedUserIds.length;
             const totalUsersRemoved = removedUserIds.length;


             // Update the allowedUsers array in the database
            const updatedListDoc = await ShoppingList.findByIdAndUpdate(
                listId,
                { $set: { allowedUsers: validAllowedUserIds } },
                { new: true, select: 'name owner allowedUsers isPublic' } // Get the updated list details
            ).populate('owner', 'username _id').populate('allowedUsers', 'username _id').lean();


            if (!updatedListDoc) { // Should not happen if list was found above, but safety check
                 console.error(`Failed to update list ${listIdStr} after ownership check.`);
                 return callback?.({ error: 'Failed to update list', code: 'DB_UPDATE_FAILED' });
            }

            console.log(`List ${listIdStr} sharing updated by owner ${user.username}. Added ${totalUsersAdded}, Removed ${totalUsersRemoved}.`);

            // 4. Log the action
            logAction({
                userId: user._id, username: user.username,
                actionType: ACTION_TYPES.LIST_SHARING_UPDATE, // Use the new action type
                targetType: TARGET_TYPES.LIST, targetId: listIdStr,
                details: {
                    listName: updatedListDoc.name,
                    addedUsersCount: totalUsersAdded,
                    removedUsersCount: totalUsersRemoved,
                    // Optionally list user IDs/usernames if needed (can be verbose)
                    // addedUserIds: addedUserIds,
                    // removedUserIds: removedUserIds,
                    newAllowedUserCount: validAllowedUserIds.length
                }
            });

            // 5. Emit Update to relevant clients
            // Emit the updated list to the owner, all users who now have access, and anyone viewing the list.
            await emitListUpdate(listId); // This helper handles sending the full list update

             // Additionally, notify users who LOST access so their client can remove the list
             removedUserIds.forEach(userId => {
                  io.to(userId).emit('listDeleted', listIdStr); // Send a 'listDeleted' event to removed users
                  console.log(`Emitted listDeleted to removed user room: ${userId} for list ${listIdStr}`);
                  // If removed user was in the list's room, force them to leave
                   io.sockets.sockets.forEach(s => {
                        if (s.request.user?._id.toString() === userId && s.rooms.has(listIdStr)) {
                            s.leave(listIdStr);
                            console.log(`Removed user's socket ${s.id} force-left room ${listIdStr}.`);
                        }
                   });
             });


            callback?.({ success: true }); // Respond to client
        } catch (error) {
            console.error(`Error updating allowed users for list ${listIdStr} by ${user.username}:`, error);
            callback?.({ error: 'Failed to update list sharing: ' + error.message, code: 'SERVER_ERROR' });
        }
    });


    // --- Item Events ---
    // Note: Item events trigger emitListUpdate which sends the *full* list including items.
    // This ensures item changes are reflected in real-time in the detail view.
    // We are also adding specific itemAdded/itemUpdated/itemDeleted events for potential client-side partial updates.

    socket.on('addItem', async ({ listId, itemName }, callback) => {
         let listIdStr = listId ? listId.toString() : 'invalid';
         try {
             // Validate input
              if (!mongoose.Types.ObjectId.isValid(listId)) {
                  console.warn(`Invalid list ID format received for addItem from ${user.username}: ${listId}`);
                 return callback?.({ error: 'Invalid list ID', code: 'INVALID_ID' });
             }
             listIdStr = listId.toString();

             if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) { return callback?.({ error: 'Item name cannot be empty', code: 'INVALID_NAME' }); }
             if (itemName.length > 150) { return callback?.({ error: 'Item name too long (max 150)', code: 'NAME_TOO_LONG' }); }

             // Check user access to the list
             const list = await checkListAccess(listId);
             if (!list) {
                  console.warn(`User ${user.username} attempted addItem to list ${listIdStr} they don't have access to.`);
                 return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
             }

             // Create new item
             const newItem = new Item({
                 name: itemName.trim(),
                 listId: listId,
                 completed: false,
                 comment: '',
                 quantityValue: null,
                 quantityUnit: ''
             });
             await newItem.save(); // Save to database

             const itemIdStr = newItem._id.toString();
             console.log(`Item '${newItem.name}' (ID: ${itemIdStr}) added to list ${listIdStr} by user ${user.username}`);

             // Log the action
             logAction({
                 userId: user._id, username: user.username,
                 actionType: ACTION_TYPES.ITEM_ADD, targetType: TARGET_TYPES.ITEM, targetId: itemIdStr,
                 details: { listId: listIdStr, itemName: newItem.name }
             });

             // Emit specific itemAdded event
             const itemToSend = { ...newItem.toObject(), listId: listIdStr };
             io.to(listIdStr).emit('itemAdded', itemToSend); // Emit to list room
             // Also emit to owner/allowed users' rooms if not public (sends full item data)
              if (!list.isPublic) {
                   const listWithUsers = await ShoppingList.findById(listId).select('owner allowedUsers').lean();
                    if (listWithUsers) {
                         io.to(listWithUsers.owner._id.toString()).emit('itemAdded', itemToSend);
                         listWithUsers.allowedUsers.forEach(allowedUser => {
                              io.to(allowedUser._id.toString()).emit('itemAdded', itemToSend);
                         });
                    }
               }


             callback?.({ success: true, item: itemToSend }); // Respond to the client
         } catch (error) {
             console.error(`Error adding item to list ${listIdStr} by ${user.username}:`, error);
             callback?.({ error: 'Failed to add item: ' + error.message, code: 'DB_ERROR' });
         }
    });

     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         let listIdStr = listId ? listId.toString() : 'invalid';
         let itemIdStr = itemId ? itemId.toString() : 'invalid';
         try {
             // Validate IDs
              if (!mongoose.Types.ObjectId.isValid(listId)) {
                  console.warn(`Invalid list ID format received for toggleItem from ${user.username}: ${listId}`);
                 return callback?.({ error: 'Invalid list ID', code: 'INVALID_LIST_ID' });
             }
             if (!mongoose.Types.ObjectId.isValid(itemId)) {
                 console.warn(`Invalid item ID format received for toggleItem from ${user.username}: ${itemId}`);
                 return callback?.({ error: 'Invalid item ID', code: 'INVALID_ITEM_ID' });
             }
             listIdStr = listId.toString();
             itemIdStr = itemId.toString();

             // Check user access to the list
             const list = await checkListAccess(listId);
             if (!list) {
                  console.warn(`User ${user.username} attempted toggleItem on list ${listIdStr} they don't have access to.`);
                 return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
             }

             // Find the item within the list
             const item = await Item.findOne({ _id: itemId, listId: listId });
             if (!item) {
                  console.warn(`User ${user.username} attempted toggleItem on item ${itemIdStr} not found in list ${listIdStr}.`);
                 return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' });
             }

             const oldCompletedStatus = item.completed;
             item.completed = !item.completed; // Toggle completion status
             await item.save(); // Save changes

             console.log(`Item ${itemIdStr} in list ${listIdStr} toggled to completed=${item.completed} by user ${user.username}`);

             // Log the action
             logAction({
                 userId: user._id, username: user.username,
                 actionType: ACTION_TYPES.ITEM_TOGGLE, targetType: TARGET_TYPES.ITEM, targetId: itemIdStr,
                 details: { listId: listIdStr, itemName: item.name, oldStatus: oldCompletedStatus, newStatus: item.completed }
             });

             // Emit specific itemUpdated event
            const itemToSend = { ...item.toObject(), listId: listIdStr };
            io.to(listIdStr).emit('itemUpdated', itemToSend); // Emit to list room
             // Also emit to owner/allowed users' rooms if not public (sends full item data)
             if (!list.isPublic) {
                  const listWithUsers = await ShoppingList.findById(listId).select('owner allowedUsers').lean();
                   if (listWithUsers) {
                        io.to(listWithUsers.owner._id.toString()).emit('itemUpdated', itemToSend);
                        listWithUsers.allowedUsers.forEach(allowedUser => {
                             io.to(allowedUser._id.toString()).emit('itemUpdated', itemToSend);
                        });
                   }
              }


             // Respond to the client with the updated item
             callback?.({ success: true, item: itemToSend });
         } catch (error) {
             console.error(`Error toggling item ${itemIdStr} by ${user.username}:`, error);
             callback?.({ error: 'Failed to toggle item: ' + error.message, code: 'DB_ERROR' });
         }
     });

    socket.on('deleteItem', async ({ listId, itemId }, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        let itemIdStr = itemId ? itemId.toString() : 'invalid';
        try {
            // Validate IDs
             if (!mongoose.Types.ObjectId.isValid(listId)) {
                 console.warn(`Invalid list ID format received for deleteItem from ${user.username}: ${listId}`);
                return callback?.({ error: 'Invalid list ID', code: 'INVALID_LIST_ID' });
            }
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                console.warn(`Invalid item ID format received for deleteItem from ${user.username}: ${itemId}`);
                return callback?.({ error: 'Invalid item ID', code: 'INVALID_ITEM_ID' });
            }
            listIdStr = listId.toString();
            itemIdStr = itemId.toString();

            // Check user access to the list
            const list = await checkListAccess(listId);
            if (!list) {
                 console.warn(`User ${user.username} attempted deleteItem on list ${listIdStr} they don't have access to.`);
                return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
            }

            // Find and delete the item
            const item = await Item.findOneAndDelete({ _id: itemId, listId: listId })
                .select('name quantityValue quantityUnit') // Select fields for logging
                .lean();

            if (!item) {
                console.warn(`Attempt to delete item ${itemIdStr} from list ${listIdStr} by ${user.username}, but item not found.`);
                return callback?.({ error: 'Item not found or already deleted', code: 'ITEM_NOT_FOUND' });
            }

            console.log(`Item ${itemIdStr} deleted from list ${listIdStr} by user ${user.username}`);

            // Log the action
            logAction({
                userId: user._id, username: user.username,
                actionType: ACTION_TYPES.ITEM_DELETE, targetType: TARGET_TYPES.ITEM, targetId: itemIdStr,
                details: { listId: listIdStr, deletedItemName: item.name, deletedQuantityValue: item.quantityValue, deletedQuantityUnit: item.quantityUnit }
            });

            // Emit specific itemDeleted event to relevant clients
            io.to(listIdStr).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr }); // Emit to list room
             // Also emit to owner/allowed users' rooms if not public
             if (!list.isPublic) {
                  const listWithUsers = await ShoppingList.findById(listId).select('owner allowedUsers').lean();
                  if (listWithUsers) {
                       io.to(listWithUsers.owner._id.toString()).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr });
                       listWithUsers.allowedUsers.forEach(allowedUser => {
                            io.to(allowedUser._id.toString()).emit('itemDeleted', { listId: listIdStr, itemId: itemIdStr });
                       });
                  }
             }


            callback?.({ success: true, itemId: itemIdStr }); // Respond to client
        } catch (error) {
            console.error(`Error deleting item ${itemIdStr} by ${user.username}:`, error);
            callback?.({ error: 'Failed to delete item: ' + error.message, code: 'DB_ERROR' });
        }
    });

    socket.on('updateItemComment', async ({ listId, itemId, comment }, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        let itemIdStr = itemId ? itemId.toString() : 'invalid';
        try {
            // Validate IDs
            if (!mongoose.Types.ObjectId.isValid(listId)) {
                 console.warn(`Invalid list ID format received for updateComment from ${user.username}: ${listId}`);
                return callback?.({ error: 'Invalid list ID', code: 'INVALID_LIST_ID' });
            }
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                console.warn(`Invalid item ID format received for updateComment from ${user.username}: ${itemId}`);
                return callback?.({ error: 'Invalid item ID', code: 'INVALID_ITEM_ID' });
            }
            listIdStr = listId.toString();
            itemIdStr = itemId.toString();

            // Validate comment format and length
            if (typeof comment !== 'string') { return callback?.({ error: 'Invalid comment format', code: 'INVALID_COMMENT' }); }
            const trimmedComment = comment.trim();
            if (trimmedComment.length > 500) { return callback?.({ error: 'Comment too long (max 500)', code: 'COMMENT_TOO_LONG' }); }

            // Check user access to the list
            const list = await checkListAccess(listId);
            if (!list) {
                console.warn(`User ${user.username} attempted updateComment on list ${listIdStr} they don't have access to.`);
                return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
            }

            // Find the item and update its comment
            const item = await Item.findOne({ _id: itemId, listId: listId });
            if (!item) {
                 console.warn(`User ${user.username} attempted updateComment on item ${itemIdStr} not found in list ${listIdStr}.`);
                return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' });
            }

            const oldComment = item.comment;
            item.comment = trimmedComment;
            await item.save(); // Save changes

             console.log(`Comment updated for item ${itemIdStr} in list ${listIdStr} by user ${user.username}`);

            // Log the action only if the comment actually changed
            if (oldComment !== trimmedComment) {
                 logAction({
                     userId: user._id, username: user.username,
                     actionType: ACTION_TYPES.ITEM_COMMENT_UPDATE, targetType: TARGET_TYPES.ITEM, targetId: itemIdStr,
                     details: { listId: listIdStr, itemName: item.name, oldComment: oldComment, newComment: trimmedComment }
                 });
             }

            // Emit specific itemUpdated event
            const itemToSend = { ...item.toObject(), listId: listIdStr };
            io.to(listIdStr).emit('itemUpdated', itemToSend); // Emit to list room
             // Also emit to owner/allowed users' rooms if not public (sends full item data)
             if (!list.isPublic) {
                  const listWithUsers = await ShoppingList.findById(listId).select('owner allowedUsers').lean();
                   if (listWithUsers) {
                        io.to(listWithUsers.owner._id.toString()).emit('itemUpdated', itemToSend);
                        listWithUsers.allowedUsers.forEach(allowedUser => {
                             io.to(allowedUser._id.toString()).emit('itemUpdated', itemToSend);
                        });
                   }
              }


            callback?.({ success: true, item: itemToSend }); // Respond to client
        } catch (error) {
            console.error(`Error updating comment for item ${itemIdStr} by ${user.username}:`, error);
            callback?.({ error: 'Failed to update comment: ' + error.message, code: 'DB_ERROR' });
        }
    });

    socket.on('updateItemQuantity', async ({ listId, itemId, quantityValue, quantityUnit }, callback) => {
        let listIdStr = listId ? listId.toString() : 'invalid';
        let itemIdStr = itemId ? itemId.toString() : 'invalid';
        try {
            // Validate IDs
            if (!mongoose.Types.ObjectId.isValid(listId)) {
                 console.warn(`Invalid list ID format received for updateQuantity from ${user.username}: ${listId}`);
                return callback?.({ error: 'Invalid list ID', code: 'INVALID_LIST_ID' });
            }
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                console.warn(`Invalid item ID format received for updateQuantity from ${user.username}: ${itemId}`);
                return callback?.({ error: 'Invalid item ID', code: 'INVALID_ITEM_ID' });
            }
            listIdStr = listId.toString();
            itemIdStr = itemId.toString();

            // Validate quantityValue (can be null/empty string, or a number)
            let valueToSet = null;
            if (quantityValue !== null && quantityValue !== undefined && quantityValue !== '') {
                const numValue = Number(quantityValue);
                if (isNaN(numValue)) {
                    return callback?.({ error: 'Invalid quantity value (must be a number)', code: 'INVALID_QUANTITY_VALUE' });
                }
                 // Optional: Add range validation (e.g., quantity >= 0)
                 if (numValue < 0) {
                     // Decide if negative quantities are allowed. Assuming not for a shopping list.
                      return callback?.({ error: 'Quantity value cannot be negative', code: 'INVALID_QUANTITY_RANGE' });
                 }
                valueToSet = numValue;
            } else if (quantityValue === '') {
                 // If client sends empty string, treat as null/cleared quantity
                 valueToSet = null;
            }

            // Validate quantityUnit (can be null/empty string, or a string)
            let unitToSet = '';
            if (quantityUnit !== null && quantityUnit !== undefined && typeof quantityUnit === 'string') {
                unitToSet = quantityUnit.trim();
                if (unitToSet.length > 50) {
                     return callback?.({ error: 'Quantity unit too long (max 50)', code: 'UNIT_TOO_LONG' });
                }
            } else if (quantityUnit === null || quantityUnit === undefined) {
                 // If client sends null or undefined, treat as empty string/cleared unit
                 unitToSet = '';
            }


            // Check user access to the list
            const list = await checkListAccess(listId);
            if (!list) {
                console.warn(`User ${user.username} attempted updateQuantity on list ${listIdStr} they don't have access to.`);
                return callback?.({ error: 'List not found or access denied', code: 'ACCESS_DENIED' });
            }

            // Find the item and update quantity fields
            const item = await Item.findOne({ _id: itemId, listId: listId });
            if (!item) {
                console.warn(`User ${user.username} attempted updateQuantity on item ${itemIdStr} not found in list ${listIdStr}.`);
                return callback?.({ error: 'Item not found in this list', code: 'ITEM_NOT_FOUND' });
            }

            const oldQuantityValue = item.quantityValue;
            const oldQuantityUnit = item.quantityUnit;

            // Update only if changes occurred to avoid unnecessary saves/emits
            if (oldQuantityValue !== valueToSet || oldQuantityUnit !== unitToSet) {
                 item.quantityValue = valueToSet;
                 item.quantityUnit = unitToSet;
                 await item.save(); // Save changes

                 console.log(`Quantity updated for item ${itemIdStr} in list ${listIdStr} by user ${user.username}`);

                 // Log the action
                 logAction({
                     userId: user._id, username: user.username,
                     actionType: ACTION_TYPES.ITEM_QUANTITY_UPDATE, targetType: TARGET_TYPES.ITEM, targetId: itemIdStr,
                     details: { listId: listIdStr, itemName: item.name, oldQuantityValue: oldQuantityValue, newQuantityValue: valueToSet, oldQuantityUnit: oldQuantityUnit, newQuantityUnit: unitToSet }
                 });

                // Emit specific itemUpdated event
                const itemToSend = { ...item.toObject(), listId: listIdStr };
                io.to(listIdStr).emit('itemUpdated', itemToSend); // Emit to list room
                 // Also emit to owner/allowed users' rooms if not public (sends full item data)
                 if (!list.isPublic) {
                      const listWithUsers = await ShoppingList.findById(listId).select('owner allowedUsers').lean();
                      if (listWithUsers) {
                           io.to(listWithUsers.owner._id.toString()).emit('itemUpdated', itemToSend);
                           listWithUsers.allowedUsers.forEach(allowedUser => {
                                io.to(allowedUser._id.toString()).emit('itemUpdated', itemToSend);
                           });
                      }
                 }
             } else {
                 // No change occurred, log and respond but don't emit
                 console.log(`Quantity update requested for item ${itemIdStr} but no change detected.`);
             }


            callback?.({ success: true, item: { ...item.toObject(), listId: listIdStr } }); // Respond to client with potentially unchanged item
        } catch (error) {
            console.error(`Error updating quantity for item ${itemIdStr} by ${user.username}:`, error);
            callback?.({ error: 'Failed to update quantity: ' + error.message, code: 'DB_ERROR' });
        }
    });


    // --- Disconnect Handler ---
    socket.on('disconnect', (reason) => {
        // Ensure user object is accessible, handle cases where auth failed
        const username = socket.request.user?.username || '(Unknown/Auth Failed)';
        console.log(`User disconnected: ${username} (Socket ID: ${socket.id}). Reason: ${reason}`); // Keep this log
        // Any cleanup related to user state or rooms can happen here if needed,
        // but Socket.IO automatically handles leaving rooms on disconnect.
    });

// === Corrected closing syntax for io.on('connection', ...) ===
}); // Correct closing parenthesis and brace for the io.on callback


// --- Serve Frontend Statically in Production ---
if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.resolve(__dirname, '../client/dist');
    console.log(`Production mode: Serving static files from: ${clientBuildPath}`);
    app.use(express.static(clientBuildPath));

    // Catch-all handler for SPA routing
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(clientBuildPath, 'index.html'));
    });
}
// In development, the client runs on a different port (e.g., 5173) via Vite's dev server.
else {
    app.get('/', (req, res) => {
        res.send("Shopping List API is running in development mode.");
    });
}


// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { // Listen on 0.0.0.0 for external access in containers/servers
    console.log(`Server running on port ${PORT}`);
    // Inform about the expected client origin if set
    if (CLIENT_ORIGIN) {
        console.log(`CORS configured for client origin: ${CLIENT_ORIGIN}`);
    } else {
         console.warn('WARN: CORS_ORIGIN is not set. Allowing all origins.');
    }
     if (!ADMIN_PIN_HASH && process.env.NODE_ENV === 'production') {
        console.error('\x1b[31m%s\x1b[0m', 'FATAL ERROR: ADMIN_PIN is not set in production. Admin panel is insecure/broken.');
         // Consider exiting in production if admin PIN is not set
        // process.exit(1);
     }
});