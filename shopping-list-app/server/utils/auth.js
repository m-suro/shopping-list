// server/utils/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'session_token'; // Name for the cookie

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

// Function to generate a JWT
const generateToken = (userId, username, isAdmin = false) => {
    const payload = {
        id: userId,
        username: username,
        isAdmin: isAdmin // Include isAdmin in the token payload
    };
    // Sign the token - potentially set an expiration? For now, no expiration as requested.
    return jwt.sign(payload, JWT_SECRET /*, { expiresIn: '7d' } */ ); // No expiration
};

// Function to set the token as an HTTP-only cookie
const setTokenCookie = (res, token) => {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true, // Cannot be accessed by client-side JavaScript
        secure: process.env.NODE_ENV === 'production', // Send only over HTTPS in production
        sameSite: 'lax', // Basic CSRF protection
        path: '/', // Make cookie available for all paths
        // expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Example: 7 days expiration
        // No 'expires' or 'maxAge' means it's a session cookie (cleared on browser close),
        // OR persists indefinitely if browser restores session. True non-expiring requires setting a far future date.
         maxAge: 365 * 24 * 60 * 60 * 1000 * 10 // ~10 years, effectively "no expiration"
    });
};

// Function to clear the token cookie
const clearTokenCookie = (res) => {
    res.cookie(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0) // Set expiry date to the past
    });
};

// Function to verify a token (used by middleware)
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return null; // Invalid token
    }
};

module.exports = {
    generateToken,
    setTokenCookie,
    clearTokenCookie,
    verifyToken,
    COOKIE_NAME
};