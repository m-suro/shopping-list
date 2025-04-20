// server/middleware/authMiddleware.js
const { verifyToken, COOKIE_NAME } = require('../utils/auth');
const User = require('../models/User'); // Assuming User model path

// Middleware to protect routes that require a logged-in user
const protect = async (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        // Verify token
        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }

        // Get user from the token ID, excluding the hashedPin
        req.user = await User.findById(decoded.id).select('-hashedPin');

        if (!req.user) {
             // Edge case: User deleted after token was issued
             clearTokenCookie(res); // Clear invalid cookie
             return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        next(); // User is authenticated, proceed
    } catch (error) {
        console.error('Authentication error:', error);
        // Clear potentially invalid cookie
        clearTokenCookie(res);
        res.status(401).json({ message: 'Not authorized, token verification failed' });
    }
};

// Middleware to protect routes that require an ADMIN user
const adminProtect = (req, res, next) => {
    // Assumes 'protect' middleware has already run and attached req.user
    if (req.user && req.user.isAdmin) {
        next(); // User is admin, proceed
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' }); // 403 Forbidden
    }
};


module.exports = { protect, adminProtect };