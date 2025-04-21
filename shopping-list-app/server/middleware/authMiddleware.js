// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming User model path
const { verifyToken, COOKIE_NAME } = require('../utils/auth'); // Import verify function and cookie name

// Middleware to protect routes requiring authentication
const protect = async (req, res, next) => {
    let token;

    // Extract token from the HttpOnly cookie
    if (req.cookies && req.cookies[COOKIE_NAME]) {
        token = req.cookies[COOKIE_NAME];
    }
    // Optional: Allow fallback to Authorization header (e.g., for testing or different clients)
    // else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    //     token = req.headers.authorization.split(' ')[1];
    // }

    if (!token) {
        console.log("Auth Middleware: No token found.");
        // Use 401 Unauthorized status
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        // Verify token using the utility function
        const decoded = verifyToken(token);

        // Find user based on token payload (excluding password/pin hash)
        // Use lean() for a plain JS object if not modifying the user doc later in the request
        req.user = await User.findById(decoded.id).select('-hashedPin').lean();

        if (!req.user) {
             console.log(`Auth Middleware: User not found for ID ${decoded.id}`);
             // If user associated with token doesn't exist anymore
             return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        // console.log(`Auth Middleware: User ${req.user.username} authenticated.`); // Reduce logging noise
        next(); // Proceed to the next middleware or route handler

    } catch (error) {
        console.error('Auth Middleware Error:', error.name, error.message);
        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Not authorized, token expired' });
        }
        // Handle other JWT verification errors (e.g., invalid signature)
        return res.status(401).json({ message: 'Not authorized, token failed verification' });
    }
};

// Middleware to protect routes requiring admin privileges
// Should be used *after* the 'protect' middleware
const adminProtect = (req, res, next) => {
    // 'protect' middleware should have already attached req.user
    if (req.user && req.user.isAdmin) {
        next(); // User is admin, proceed
    } else {
        // Use 403 Forbidden status for insufficient permissions
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
};


module.exports = { protect, adminProtect };