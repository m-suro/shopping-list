// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming model path

// Middleware to protect routes requiring authentication
const protect = async (req, res, next) => {
    let token;
    // console.log("Cookies received by 'protect':", req.cookies); // Debugging

    if (req.cookies && req.cookies.session_token) {
        try {
            token = req.cookies.session_token;
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Attach user to the request (excluding hashedPin)
            // Fetch fresh user data to ensure validity and latest admin status
            const user = await User.findById(decoded.userId).select('-hashedPin');
            if (!user) {
                 // Clear cookie if user doesn't exist anymore
                 res.cookie('session_token', '', {
                     httpOnly: true,
                     expires: new Date(0), // Expire immediately
                     secure: process.env.NODE_ENV === 'production', // Use 'true' in production
                     sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Adjust SameSite for cross-origin if needed
                 });
                 return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            req.user = { // Structure expected by frontend/socket auth
                userId: user._id.toString(), // Ensure it's a string
                username: user.username,
                isAdmin: user.isAdmin,
            };
            // console.log("User attached to req:", req.user); // Debugging
            next();
        } catch (error) {
            console.error('Token verification failed:', error.message);
             // Clear potentially invalid cookie
             res.cookie('session_token', '', {
                 httpOnly: true,
                 expires: new Date(0),
                 secure: process.env.NODE_ENV === 'production',
                 sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
             });
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Middleware to protect admin routes (runs *after* protect)
const adminProtect = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' }); // 403 Forbidden
    }
};


// Helper function to extract user data from socket handshake cookie
// This logic will be used in server.js io.use()
const getUserFromSocketCookie = async (socket) => {
    const cookieHeader = socket.request.headers.cookie;
    // console.log("Socket handshake cookies:", cookieHeader); // Debugging

    if (!cookieHeader) {
        return null;
    }

    // Simple cookie parsing (replace with 'cookie' library if complex needs arise)
    const cookies = cookieHeader.split(';').reduce((res, item) => {
        const data = item.trim().split('=');
        return { ...res, [data[0]]: data[1] };
    }, {});

    const token = cookies.session_token;
    // console.log("Extracted socket token:", token); // Debugging

    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Optionally fetch fresh user data here as well for consistency
        const user = await User.findById(decoded.userId).select('-hashedPin');
        if (!user) {
            return null; // User associated with token no longer exists
        }
        // console.log("User verified from socket token:", user.username); // Debugging
        return { // Return data in the same format as protect middleware
             userId: user._id.toString(),
             username: user.username,
             isAdmin: user.isAdmin,
         };
    } catch (error) {
        console.error('Socket token verification failed:', error.message);
        return null;
    }
};


module.exports = { protect, adminProtect, getUserFromSocketCookie };