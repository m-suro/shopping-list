// server/models/LogEntry.js
const mongoose = require('mongoose');

// Enums for consistency
const ACTION_TYPES = [
    'USER_LOGIN_SUCCESS', 'USER_LOGIN_FAIL', 'USER_LOGOUT',
    'ADMIN_PIN_VERIFY_SUCCESS', 'ADMIN_PIN_VERIFY_FAIL',
    'ADMIN_USER_CREATE', 'ADMIN_USER_DELETE',
    'ADMIN_LIST_DELETE',
    'LIST_CREATE', 'LIST_DELETE', 'LIST_PRIVACY_TOGGLE',
    'LIST_USER_INVITE', 'LIST_USER_REMOVE',
    'ITEM_ADD', 'ITEM_DELETE', 'ITEM_TOGGLE', 'ITEM_COMMENT_UPDATE'
    // Add more action types as needed
];

const TARGET_TYPES = [
    'USER', 'LIST', 'ITEM', 'AUTH', 'SYSTEM', 'NONE'
    // Add more target types as needed
];

const logEntrySchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now,
        index: true // Index for sorting and time-based filtering
    },
    userId: { // ID of the user performing the action (if applicable)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true // Index for filtering by user
    },
    username: { // Username of the user performing the action (denormalized for easier display)
        type: String,
        trim: true
    },
    actionType: {
        type: String,
        required: true,
        enum: ACTION_TYPES,
        index: true // Index for filtering by action type
    },
    targetType: { // The type of entity being acted upon
        type: String,
        enum: TARGET_TYPES,
        index: true // Index for filtering by target type
    },
    targetId: { // The ID of the entity being acted upon (if applicable)
        type: String, // Use String to accommodate different ID types or non-ObjectId references
        index: true
    },
    ipAddress: { // IP address, particularly useful for auth logs
        type: String,
        trim: true
    },
    details: { // Flexible field for additional context-specific information
        type: mongoose.Schema.Types.Mixed // Can store objects, strings, etc.
    }
}, {
    timestamps: { createdAt: 'timestamp', updatedAt: false }, // Use built-in timestamp for creation only
    collection: 'logentries' // Explicit collection name
});

// Optional: Expire logs after a certain period (e.g., 90 days) using TTL index
// logEntrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const LogEntry = mongoose.model('LogEntry', logEntrySchema);

module.exports = { LogEntry, ACTION_TYPES, TARGET_TYPES };