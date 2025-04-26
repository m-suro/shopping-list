// client/src/components/common/LoadingOverlay.jsx
import React from 'react';

// --- Loading Overlay Component ---
// Displays a full-screen overlay with a spinner.
function LoadingOverlay() {
    return (
        // Fixed position to cover the entire viewport
        // Backdrop-blur and semi-transparent background for visual effect
        // z-[999] ensures it's on top of almost everything
        <div className="fixed inset-0 bg-background/70 dark:bg-dark-background/70 backdrop-blur-sm flex justify-center items-center z-[999]">
            {/* Spinner animation */}
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary dark:border-dark-primary"></div>
        </div>
    );
}

export default LoadingOverlay;