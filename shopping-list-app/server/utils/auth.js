// server/utils/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'session_token';
// Use a long expiry for the session cookie (e.g., 10 years in seconds)
// Alternatively, use a shorter expiry (e.g., '1d', '7d') and implement refresh tokens if needed.
const JWT_EXPIRY = '3650d'; // 10 years
const COOKIE_MAX_AGE = 3650 * 24 * 60 * 60 * 1000; // 10 years in milliseconds

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

// Generates a JWT token
const generateToken = (userId, username, isAdmin) => {
    if (!userId || !username) {
        throw new Error('User ID and username are required to generate token');
    }
    const payload = {
        id: userId,
        username: username,
        isAdmin: !!isAdmin // Ensure boolean
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

// Verifies a JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error("Token verification failed:", error.message); // Log specific JWT errors
        // Don't throw generic error, let caller handle specific JWT errors
        // like TokenExpiredError or JsonWebTokenError
        throw error;
    }
};

// Sets the token as an HttpOnly cookie on the response
const setTokenCookie = (res, token) => {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true, // Prevent client-side JS access
        secure: process.env.NODE_ENV === 'production', // Send only over HTTPS in production
        sameSite: 'Lax', // Recommended for most cases to prevent CSRF
        path: '/', // Make cookie available for all paths
        maxAge: COOKIE_MAX_AGE, // Set cookie expiry (in ms)
        // domain: process.env.COOKIE_DOMAIN // Optional: Use if needed for subdomains
    });
};

// Clears the token cookie
const clearTokenCookie = (res) => {
    res.cookie(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/',
        expires: new Date(0), // Set expiry date to the past
    });
};

module.exports = {
    generateToken,
    verifyToken,
    setTokenCookie,
    clearTokenCookie,
    COOKIE_NAME,
};