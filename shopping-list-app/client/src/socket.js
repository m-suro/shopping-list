// client/src/socket.js
import { io } from 'socket.io-client';

// IMPORTANT: Replace with your *backend* server URL
// In Codespaces, this might be a dynamically forwarded port URL.
// Or if running locally: 'http://localhost:5001' (your backend PORT)
// Find your forwarded backend port URL in the Codespaces 'PORTS' tab
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';

console.log(`Connecting Socket.IO to: ${SERVER_URL}`);

export const socket = io(SERVER_URL, {
    autoConnect: false // Prevent automatic connection initially
});