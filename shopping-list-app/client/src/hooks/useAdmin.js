// client/src/hooks/useAdmin.js
// Description: Custom hook for managing admin verification state and handlers.

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Get the API URL from environment variables (needed for the verification fetch call)
const API_URL = import.meta.env.VITE_SERVER_URL;


/**
 * Custom hook for managing admin verification state and related actions.
 *
 * @param {object} params - Parameters passed from the App component.
 * @param {boolean} params.isAdminVerified - App's state indicating if the admin PIN is verified. (ADDED)
 * @param {Function} params.setIsLoading - Setter for App's general loading state (used during PIN verification).
 * @param {Function} params.setError - Setter for App's general error state.
 * @param {Function} params.setCurrentView - Setter for App's currentView state (to switch to admin views).
 * @param {Function} params.setIsAdminVerified - Setter for App's isAdminVerified state.
 * @param {Function} params.setIsAdminPinModalOpen - Setter for App's isAdminPinModalOpen state.
 * @param {Function} params.setAdminPinError - Setter for App's adminPinError state.
 */
function useAdmin({
    isAdminVerified, // ACCEPTED AS PARAMETER
    setIsLoading,
    setError,
    setCurrentView,
    setIsAdminVerified,
    setIsAdminPinModalOpen,
    setAdminPinError
}) {
    const { t } = useTranslation(); // Call useTranslation inside the hook

    // State managed by App and updated via setters: isAdminVerified, isAdminPinModalOpen, adminPinError


    // Handler to open the Admin PIN modal and reset any previous errors
    const handleOpenAdminPinModal = useCallback(() => {
        console.log("useAdmin: Opening Admin PIN modal.");
        setAdminPinError(null);
        setIsAdminPinModalOpen(true);
    }, [setAdminPinError, setIsAdminPinModalOpen]); // Dependencies: setters passed from App are stable

    // Handler to verify the entered PIN against the server
    const handleVerifyAdminPin = useCallback(async (pin) => {
        if (!API_URL) {
            console.error("useAdmin: API URL not configured.");
            setAdminPinError("API URL not configured.");
            return;
        }
         if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
             console.warn("useAdmin: Invalid PIN format provided.");
             setAdminPinError(t('login_invalid_input'));
             return;
         }

        setIsLoading(true);
        setAdminPinError(null);

        try {
            console.log("useAdmin: Verifying admin PIN...");
            const res = await fetch(`${API_URL}/api/admin/verify-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
                credentials: 'include'
            });

            const data = await res.json();

            if (!res.ok) {
                console.error("useAdmin: Admin verification failed:", data.message, "Status:", res.status);
                throw new Error(data.message || `Admin verification failed with status ${res.status}`);
            }

            console.log("useAdmin: Admin verification successful.");
            setIsAdminVerified(true);
            setIsAdminPinModalOpen(false);
            setCurrentView('admin');

            setError(null);
            setAdminPinError(null);

        } catch (err) {
            console.error("useAdmin: Admin PIN verification caught error:", err);
            setAdminPinError(err.message || t('admin_verification_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, t, setIsLoading, setAdminPinError, setIsAdminPinModalOpen, setCurrentView, setError, setIsAdminVerified]); // Dependencies: setters passed from App, API_URL, t, isAdminVerified (needed for state update callback)

    // Handler to exit admin mode and return to the main lists view
    const handleExitAdminMode = useCallback(() => {
        console.log("useAdmin: Exiting admin mode.");
        setIsAdminVerified(false);
        setCurrentView('lists');

        setError(null);
        setAdminPinError(null);

    }, [setIsAdminVerified, setCurrentView, setError, setAdminPinError]); // Dependencies: setters passed from App are stable

    // Handler to navigate to the Admin Logs view.
    // It checks if admin is verified first, and prompts for PIN if not.
    const handleNavigateToLogs = useCallback(() => {
        console.log("useAdmin: Attempting to navigate to logs.");
        // Now isAdminVerified is available as a parameter
        if (isAdminVerified) { // READ isAdminVerified here
            console.log("useAdmin: Admin verified, navigating to logs view.");
            setCurrentView('adminLogs');
            setError(null);
            setAdminPinError(null);
        } else {
            console.warn("useAdmin: Attempted to navigate to logs without verification. Opening PIN modal.");
            handleOpenAdminPinModal();
        }
    }, [isAdminVerified, setCurrentView, setError, setAdminPinError, handleOpenAdminPinModal]); // Dependency array is correct

    // Return the state and handler functions that the App component needs to use.
    return {
        // Admin state variables are managed by App and passed in.

        // Handlers returned by the hook
        handleOpenAdminPinModal, // Expose handler to open modal
        handleVerifyAdminPin, // Handler for modal verification
        handleExitAdminMode, // Handler to exit admin mode
        handleNavigateToLogs, // Handler to navigate to logs
    };
}

export default useAdmin;