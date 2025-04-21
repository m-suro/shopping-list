// server/utils/logger.js
const { LogEntry } = require('../models/LogEntry');

/**
 * Asynchronously logs an action to the database.
 * @param {object} logData - The data to log.
 * @param {mongoose.Schema.Types.ObjectId} [logData.userId] - ID of the user performing the action.
 * @param {string} [logData.username] - Username of the user performing the action.
 * @param {string} logData.actionType - The type of action performed (must be in ACTION_TYPES enum).
 * @param {string} logData.targetType - The type of entity affected (must be in TARGET_TYPES enum).
 * @param {string} [logData.targetId] - The ID of the affected entity.
 * @param {string} [logData.ipAddress] - The IP address of the request originator.
 * @param {object|string} [logData.details] - Additional context-specific details.
 */
const logAction = async (logData) => {
    try {
        const { userId, username, actionType, targetType, targetId, ipAddress, details } = logData;

        // Basic validation (can add more checks, e.g., against enums if needed)
        if (!actionType || !targetType) {
            console.error("Log attempt failed: Missing required actionType or targetType", logData);
            return;
        }

        const newLog = new LogEntry({
            timestamp: new Date(), // Ensure timestamp is set on creation here
            userId: userId || null,
            username: username || null,
            actionType: actionType,
            targetType: targetType,
            targetId: targetId || null,
            ipAddress: ipAddress || null,
            details: details || {},
        });

        await newLog.save();
        // console.log(`Logged Action: ${actionType} by ${username || 'System'}`); // Optional: Log to console
    } catch (error) {
        // Log errors during the logging process itself, but don't let it crash the app
        console.error(`Failed to save log entry for action ${logData.actionType}:`, error);
        // Potentially add more robust error handling here (e.g., write to a fallback file log)
    }
};

module.exports = { logAction };