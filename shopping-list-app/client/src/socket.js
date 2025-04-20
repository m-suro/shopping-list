// client/src/socket.js
import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL;

if (!URL) {
  console.error("CRITICAL ERROR: VITE_SERVER_URL is not defined in your .env file!");
}

console.log(`Socket.IO: Attempting to connect to server at ${URL || 'URL not set!'}`);

// Initialize the socket connection
export const socket = io(URL, {
    autoConnect: false, // We explicitly call connect() in App.jsx
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    // *** ADD MATCHING CUSTOM PATH ***
    path: "/customsocketpath/", // Must match the server path exactly
    // *** REMOVED transports: ['websocket'] to allow polling again ***
    // Let Socket.IO try polling first with the custom path
    // withCredentials: true, // Only if needed
});

// --- Connection lifecycle logging ---

socket.on('connect', () => {
  // Use optional chaining for safety as engine might be briefly undefined
  console.log(`Socket connected via ${socket.io?.engine?.transport?.name}: ${socket.id} to ${URL}`);
  // Add the engine listener *after* connection succeeds
  if (socket.io?.engine) { // Check if engine exists before attaching listener
      socket.io.engine.on("upgrade", (transport) => {
        // This might fire now if polling connects and then upgrades
        console.log(`Socket transport upgraded to: ${transport.name}`);
      });
  } else {
      console.warn("Socket engine not available immediately after connect to attach upgrade listener.");
  }
});

socket.on('disconnect', (reason) => {
  console.warn(`Socket disconnected from ${URL}. Reason: ${reason}`);
  if (reason === 'io server disconnect') {
    console.error('Server forced disconnection.');
  }
});

socket.on('connect_error', (err) => {
  console.error(`Socket connection error to ${URL}: ${err.message}`, err);
   if (err.transport) {
        console.error(` -> Transport: ${err.transport}`);
   }
});

socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Socket reconnect attempt #${attempt} to ${URL}`);
});

socket.io.on('reconnect_failed', () => {
    console.error(`Socket reconnection failed after multiple attempts to ${URL}.`);
});

socket.io.on('reconnect_error', (err) => {
    console.error(`Socket reconnection error to ${URL}: ${err.message}`);
});

socket.io.on('reconnect', (attempt) => {
     console.log(`Socket reconnected successfully to ${URL} on attempt #${attempt}`);
});

// --- End of enhanced logging ---