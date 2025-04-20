// client/src/socket.js
import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL;
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || "/customsocketpath/"; // Use env var or default

if (!URL) {
  console.error("CRITICAL ERROR: VITE_SERVER_URL is not defined in your .env file!");
  // Consider throwing an error or providing a default URL for local development
  // throw new Error("VITE_SERVER_URL is not defined");
}

console.log(`Socket.IO: Server URL = ${URL || 'URL not set!'}`);
console.log(`Socket.IO: Path = ${SOCKET_PATH}`);

// Initialize the socket connection
export const socket = io(URL, {
    autoConnect: false, // We explicitly call connect() in App.jsx
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    path: SOCKET_PATH, // Use the variable here
    withCredentials: true, // *** THIS LINE IS CRUCIAL FOR AUTHENTICATION ***
    // Remove specific transports unless absolutely necessary, let Socket.IO negotiate
    // transports: ['websocket'] // Keep commented out unless needed for specific proxy issues
});

// --- Connection lifecycle logging ---

socket.on('connect', () => {
  console.log(`Socket connected via ${socket.io?.engine?.transport?.name || 'unknown'}: ${socket.id} to ${URL}`);
  // Adding the upgrade listener here is fine.
  if (socket.io?.engine) {
      socket.io.engine.on("upgrade", (transport) => {
        console.log(`Socket transport upgraded to: ${transport.name}`);
      });
  }
});

socket.on('disconnect', (reason) => {
  console.warn(`Socket disconnected from ${URL}. Reason: ${reason}`);
  if (reason === 'io server disconnect') {
    console.error('Server forced disconnection (likely auth issue or server restart).');
    // Consider triggering a logout or showing a message in the UI here
  }
});

socket.on('connect_error', (err) => {
  // Log the error details
  console.error(`Socket connection error to ${URL}: ${err.message}`, err);
   if (err.transport) {
        console.error(` -> Transport: ${err.transport}`);
   }
   // More specific handling can be added here based on err.message
   // For example, if err.message contains 'Authentication error', you might want to trigger logout
});

socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Socket reconnect attempt #${attempt} to ${URL}`);
});

socket.io.on('reconnect_failed', () => {
    console.error(`Socket reconnection failed after multiple attempts to ${URL}.`);
    // Consider showing an error message to the user
});

socket.io.on('reconnect_error', (err) => {
    console.error(`Socket reconnection error to ${URL}: ${err.message}`);
});

socket.io.on('reconnect', (attempt) => {
     console.log(`Socket reconnected successfully to ${URL} on attempt #${attempt} via ${socket.io?.engine?.transport?.name || 'unknown'}`);
});

// --- End of enhanced logging ---