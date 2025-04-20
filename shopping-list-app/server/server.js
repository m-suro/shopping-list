// server/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');

// Models
const ShoppingList = require('./models/ShoppingList');
const Item = require('./models/Item');
const User = require('./models/User');

// Auth Utils & Middleware
const { generateToken, setTokenCookie, clearTokenCookie, verifyToken, COOKIE_NAME } = require('./utils/auth');
const { protect, adminProtect } = require('./middleware/authMiddleware');

// Env Vars & Validation
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CORS_ORIGIN;
const ADMIN_PIN_HASH = process.env.ADMIN_PIN ? bcrypt.hashSync(process.env.ADMIN_PIN, 10) : null;
if (!MONGODB_URI) { console.error("FATAL: MONGODB_URI not set."); process.exit(1); }
if (!CLIENT_ORIGIN) { console.warn("WARN: CORS_ORIGIN not set."); }

// Express App & Server
const app = express();
const server = http.createServer(app);

// CORS Config
const corsOptions = { origin: CLIENT_ORIGIN || '*', credentials: true };

// Middleware
app.use(cors(corsOptions)); // Apply CORS first
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => { console.error('MongoDB Connection Error:', err); process.exit(1); });

// Socket.IO Setup & Auth Middleware
const io = new Server(server, { path: "/customsocketpath/", cors: corsOptions });

io.use(async (socket, next) => { /* ... Socket auth middleware (no changes needed) ... */
    const token = socket.handshake.auth.token || socket.handshake.headers.cookie?.split('; ').find(row => row.startsWith(`${COOKIE_NAME}=`))?.split('=')[1];
    if (!token) return next(new Error('Auth error: No token'));
    try {
        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) return next(new Error('Auth error: Invalid token'));
        const user = await User.findById(decoded.id).select('username isAdmin _id').lean();
        if (!user) return next(new Error('Auth error: User not found'));
        socket.request.user = user;
        next();
    } catch (error) { next(new Error('Auth error: Token verification failed')); }
});

// ========== API Routes ==========
// --- Auth Routes ---
app.post('/api/auth/login', async (req, res) => { /* ... Login logic ... */ });
app.post('/api/auth/logout', (req, res) => { /* ... Logout logic ... */ });
app.get('/api/auth/session', protect, (req, res) => { /* ... Session check logic ... */ });
app.post('/api/admin/verify-pin', protect, adminProtect, async (req, res) => { /* ... Admin PIN check ... */ });

// --- Shopping List API Routes ---
// GET Lists (includes owner populated, used by ShoppingLists component)
app.get('/api/lists', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const lists = await ShoppingList.find({
            $or: [ { owner: userId }, { isPublic: true }, { allowedUsers: userId } ]
        }).populate('owner', 'username') // Populate owner username
          .sort({ createdAt: -1 }); // Sort by newest first
        res.json(lists);
    } catch (error) { console.error("Error fetching lists:", error); res.status(500).json({ message: 'Error fetching lists' }); }
});

// GET List Details (including allowedUsers populated, potentially used by ShoppingListDetail)
// We might not need this if we include everything in the socket 'listDetailsUpdated' event
app.get('/api/lists/:listId/details', protect, async (req, res) => {
     try {
         const userId = req.user._id;
         const listId = req.params.listId;
         if (!mongoose.Types.ObjectId.isValid(listId)) return res.status(400).json({ message: 'Invalid list ID' });

         const list = await ShoppingList.findOne({ _id: listId })
             .populate('owner', 'username')
             .populate('allowedUsers', 'username'); // Populate allowed users

         if (!list) return res.status(404).json({ message: 'List not found' });

         // Check access permission
         const isOwner = list.owner._id.equals(userId);
         const isAllowed = list.allowedUsers.some(user => user._id.equals(userId));
         const canAccess = isOwner || list.isPublic || isAllowed;

         if (!canAccess) return res.status(403).json({ message: 'Access denied' });

         res.json(list); // Send detailed list data
     } catch (error) {
         console.error(`Error fetching list details ${req.params.listId}:`, error);
         res.status(500).json({ message: 'Error fetching list details' });
     }
});

// GET Items (permission check already included)
app.get('/api/lists/:listId/items', protect, async (req, res) => { /* ... Existing items fetch logic ... */ });


// ========== Socket.IO Event Handlers ==========

io.on('connection', (socket) => {
    const user = socket.request.user;
    if(!user) { socket.disconnect(true); return; }
    console.log(`User connected via socket: ${user.username} (ID: ${user._id}, Socket ID: ${socket.id})`);

    // Helper: Check Modify Access (Owner or AllowedUser for private, anyone for public)
    const checkListModifyAccess = async (listId) => {
         if (!mongoose.Types.ObjectId.isValid(listId)) return null;
         const list = await ShoppingList.findById(listId).select('owner isPublic allowedUsers').lean();
         if (!list) return null; // List doesn't exist

         const isOwner = list.owner.equals(user._id);
         const isAllowed = list.allowedUsers.some(allowedId => allowedId.equals(user._id));

         // Allow if: owner OR (list is private AND user is allowed) OR list is public
         if (isOwner || (!list.isPublic && isAllowed) || list.isPublic) {
             return list; // Return list info if access granted
         }
         return null; // Access denied
     };
     // Helper: Check View Access (used by joinList)
     const checkListViewAccess = async (listId) => {
         // Same logic as checkListModifyAccess for viewing in this implementation
         return checkListModifyAccess(listId); // Re-use for simplicity now
     };
     // Helper: Check Ownership (stricter for privacy/sharing changes)
      const checkListOwnership = async (listId) => {
          if (!mongoose.Types.ObjectId.isValid(listId)) return null;
          return await ShoppingList.findOne({ _id: listId, owner: user._id }).select('_id owner').lean();
      };


    // --- List Events ---
    // **MODIFIED**: Accept isPublic flag
    socket.on('addList', async ({ listName, isPublic }, callback) => {
        try {
            const name = listName?.trim();
            if (!name) { return callback?.({ error: 'List name cannot be empty' }); }

            const newList = new ShoppingList({
                 name: name,
                 owner: user._id,
                 isPublic: !!isPublic, // Ensure boolean, default false if undefined
            });
            await newList.save();
            const populatedList = await ShoppingList.findById(newList._id).populate('owner', 'username').lean(); // Repopulate owner

            console.log(`List '${newList.name}' (Public: ${newList.isPublic}) added by user ${user.username}`);
            io.emit('listsUpdated'); // Notify everyone lists changed
            callback?.({ success: true, list: populatedList });
        } catch (error) {
            console.error(`Error adding list for user ${user.username}:`, error);
            callback?.({ error: 'Failed to add list: ' + error.message });
        }
    });

     socket.on('deleteList', async (listId, callback) => {
        try {
             const list = await checkListOwnership(listId); // Owner check
             if (!list) { return callback?.({ error: 'List not found or permission denied' }); }

             await Item.deleteMany({ listId: list._id });
             await ShoppingList.findByIdAndDelete(listId);
             console.log(`List ${listId} deleted by owner ${user.username}`);
             io.emit('listDeleted', listId); // Broadcast
             callback?.({ success: true });
        } catch (error) {
             console.error(`Error deleting list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to delete list: ' + error.message });
        }
     });

    // --- NEW: List Privacy & Sharing Events ---
    socket.on('updateListPrivacy', async ({ listId, isPublic }, callback) => {
         try {
             const list = await checkListOwnership(listId); // Owner check
             if (!list) { return callback?.({ error: 'List not found or permission denied' }); }

             const updatedList = await ShoppingList.findByIdAndUpdate(
                 listId,
                 { $set: { isPublic: !!isPublic } },
                 { new: true } // Return the updated document
             ).populate('owner', 'username').populate('allowedUsers', 'username'); // Repopulate necessary fields

             if (!updatedList) return callback?.({ error: 'Failed to update list' }); // Should not happen if owner check passed

             console.log(`List ${listId} privacy updated to ${updatedList.isPublic} by owner ${user.username}`);
             // Notify clients in the room about the details change
             io.to(listId).emit('listDetailsUpdated', updatedList);
             // Also broadcast general list update? Maybe necessary if public status changes visibility for others.
             io.emit('listsUpdated');
             callback?.({ success: true, list: updatedList });
         } catch (error) {
             console.error(`Error updating list privacy for ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to update privacy: ' + error.message });
         }
     });

     socket.on('inviteUserToList', async ({ listId, usernameToInvite }, callback) => {
        try {
            const list = await checkListOwnership(listId); // Owner check
            if (!list) { return callback?.({ error: 'List not found or permission denied' }); }

            // Cannot invite to public lists
            const fullList = await ShoppingList.findById(listId).select('isPublic owner allowedUsers'); // Get needed fields
            if (fullList.isPublic) { return callback?.({ error: 'Cannot invite users to a public list.' }); }

            if (!usernameToInvite || typeof usernameToInvite !== 'string') { return callback?.({ error: 'Invalid username provided.' }); }

            const targetUser = await User.findOne({ username: usernameToInvite.toLowerCase() }).select('_id username');
            if (!targetUser) { return callback?.({ error: `User "${usernameToInvite}" not found.` }); }

            // Cannot invite self
            if (targetUser._id.equals(user._id)) { return callback?.({ error: 'You cannot invite yourself.' }); }

            // Check if already invited (using $addToSet avoids error but good to check first for feedback)
             if (fullList.allowedUsers.some(id => id.equals(targetUser._id))) {
                return callback?.({ error: `User "${targetUser.username}" is already invited.` });
             }

            // Add user to allowedUsers
            const updatedList = await ShoppingList.findByIdAndUpdate(
                listId,
                { $addToSet: { allowedUsers: targetUser._id } }, // Use $addToSet to prevent duplicates
                { new: true }
            ).populate('owner', 'username').populate('allowedUsers', 'username');

            if (!updatedList) return callback?.({ error: 'Failed to invite user.' });

            console.log(`User ${targetUser.username} invited to list ${listId} by owner ${user.username}`);
            io.to(listId).emit('listDetailsUpdated', updatedList); // Update everyone in the room
            // TODO: Optionally notify the invited user directly
            io.emit('listsUpdated'); // Refresh lists globally as access might have changed
            callback?.({ success: true, list: updatedList });

        } catch (error) {
            console.error(`Error inviting user to list ${listId} by ${user.username}:`, error);
            callback?.({ error: 'Failed to invite user: ' + error.message });
        }
    });

     socket.on('removeUserFromList', async ({ listId, userIdToRemove }, callback) => {
         try {
             const list = await checkListOwnership(listId); // Owner check
             if (!list) { return callback?.({ error: 'List not found or permission denied' }); }

             if (!mongoose.Types.ObjectId.isValid(userIdToRemove)) { return callback?.({ error: 'Invalid user ID to remove.' }); }

              // Cannot remove self (owner) this way
             if (list.owner.equals(userIdToRemove)) { return callback?.({ error: 'Cannot remove the list owner.' }); }

             const updatedList = await ShoppingList.findByIdAndUpdate(
                 listId,
                 { $pull: { allowedUsers: userIdToRemove } }, // Use $pull to remove user ID
                 { new: true }
             ).populate('owner', 'username').populate('allowedUsers', 'username');

             if (!updatedList) return callback?.({ error: 'Failed to remove user.' });

             console.log(`User ${userIdToRemove} removed from list ${listId} by owner ${user.username}`);
             io.to(listId).emit('listDetailsUpdated', updatedList); // Update everyone in the room
             // TODO: Optionally notify the removed user directly
             io.emit('listsUpdated'); // Refresh lists globally as access might have changed
             callback?.({ success: true, list: updatedList });

         } catch (error) {
             console.error(`Error removing user from list ${listId} by ${user.username}:`, error);
             callback?.({ error: 'Failed to remove user: ' + error.message });
         }
     });

    // --- Item Events (Use Modify Access Check) ---
    socket.on('addItem', async ({ listId, itemName }, callback) => {
         try {
             if (!itemName?.trim()) return callback?.({ error: 'Item name empty' });
             const list = await checkListModifyAccess(listId); // Check modify access
             if (!list) return callback?.({ error: 'List not found or permission denied' });

             const newItem = new Item({ name: itemName.trim(), listId: listId });
             await newItem.save();
             io.to(listId).emit('itemAdded', { ...newItem.toObject(), listId: listId });
             callback?.({ success: true, item: newItem });
         } catch (error) { callback?.({ error: 'Failed to add item: ' + error.message }); }
    });

     socket.on('toggleItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) return callback?.({ error: 'Invalid item ID' });
             const list = await checkListModifyAccess(listId); // Check modify access
             if (!list) return callback?.({ error: 'List not found or permission denied' });

             const item = await Item.findById(itemId);
             if (!item || !item.listId.equals(listId)) return callback?.({ error: 'Item not found' });

             item.completed = !item.completed;
             await item.save();
             io.to(listId).emit('itemUpdated', { ...item.toObject(), listId: listId });
             callback?.({ success: true, item: item });
         } catch (error) { callback?.({ error: 'Failed to toggle item: ' + error.message }); }
     });

     socket.on('deleteItem', async ({ listId, itemId }, callback) => {
         try {
             if (!mongoose.Types.ObjectId.isValid(itemId)) return callback?.({ error: 'Invalid item ID' });
             const list = await checkListModifyAccess(listId); // Check modify access
             if (!list) return callback?.({ error: 'List not found or permission denied' });

             const item = await Item.findOneAndDelete({ _id: itemId, listId: listId });
             if (!item) return callback?.({ error: 'Item not found' });

             io.to(listId).emit('itemDeleted', itemId);
             callback?.({ success: true, itemId: itemId });
         } catch (error) { callback?.({ error: 'Failed to delete item: ' + error.message }); }
     });


    // --- Room Management ---
    socket.on('joinList', async (listId) => {
         const list = await checkListViewAccess(listId); // Verify view access before joining
         if(list) { socket.join(listId); console.log(`${user.username} joined room ${listId}`); }
         else { console.warn(`${user.username} denied joining room ${listId}`); }
    });
    socket.on('leaveList', (listId) => { socket.leave(listId); console.log(`${user.username} left room ${listId}`); });

    // --- Disconnect ---
    socket.on('disconnect', (reason) => { console.log(`User disconnected: ${user.username}. Reason: ${reason}`); });
});


// --- Serve Frontend ---
if (process.env.NODE_ENV === 'production') { /* ... serve static files ... */ }
else { app.get('/', (req, res) => { res.send("API is running..."); }); }

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { /* ... server start log ... */ });