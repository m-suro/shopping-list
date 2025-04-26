// client/src/hooks/useAuth.js
// Description: Custom hook for managing authentication state and logic.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Import necessary services/utilities that Auth interacts with
import * as offlineService from '../services/offlineService'; // For loading/clearing local data
import { socket } from '../socket'; // To attempt socket connection after login


// Get the API URL from environment variables (needed for fetch calls)
const API_URL = import.meta.env.VITE_SERVER_URL;

/**
 * Custom hook for managing authentication state and login/logout processes.
 *
 * @param {object} params - Parameters passed from the App component.
 * @param {boolean} params.isSocketAttempted - App's state indicating if a connection attempt has been made this session. (ADDED)
 * @param {Function} params.setIsSocketAttempted - Setter for App's isSocketAttempted state.
 * @param {Function} params.setLists - Setter for App's lists state.
 * @param {Function} params.setPendingActions - Setter for App's pendingActions state.
 * @param {Function} params.setCurrentView - Setter for App's currentView state.
 * @param {Function} params.setError - Setter for App's general error state.
 * @param {boolean} params.isOnline - App's online status.
 * @param {Function} [params.fetchLists] - Optional callback from App to fetch lists after login.
 */
function useAuth({
    isSocketAttempted, // ACCEPTED AS PARAMETER
    setIsSocketAttempted,
    setLists,
    setPendingActions,
    setCurrentView,
    setError,
    isOnline,
    fetchLists,
}) {
    const { t } = useTranslation();

    // State managed by this hook
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState(null); // Specific error for the login form


    // Handler called by the Login component on successful API authentication.
    const handleLogin = useCallback(async (userData) => {
        console.log("useAuth: handleLogin called.");
        if (!userData || !userData.user) {
            console.error("useAuth: Login handler received invalid data.");
            setAuthError(t('login_failed_generic'));
            return;
        }

        setCurrentUser(userData.user);
        console.log("useAuth: User logged in:", userData.user.username);

        const storedLists = offlineService.getStoredLists();
        const pending = offlineService.getPendingActions();
        console.log(`useAuth: Loaded ${storedLists.length} lists and ${pending.length} pending actions from local storage after login.`);
        setLists(storedLists);
        setPendingActions(pending);

        setAuthError(null);
        setCurrentView('lists');

        // Attempt to establish a socket connection now that we are authenticated and online.
        // Check both isOnline AND if an attempt hasn't been made yet for this session.
        if (isOnline && !socket.connected && !isSocketAttempted) { // READ isSocketAttempted here
            console.log("useAuth: User logged in, online, attempting socket connect.");
            socket.connect();
            setIsSocketAttempted(true); // Use setter
        } else if (!isOnline) {
             console.log("useAuth: User logged in but offline, skipping socket connect attempt for now.");
        } else if (socket.connected) {
             console.log("useAuth: User logged in, socket already connected.");
             setIsSocketAttempted(true); // Ensure this is true if already connected
        }

        // Fetch latest lists after login and attempting connection
        if (isOnline && fetchLists) {
            console.log("useAuth: User logged in and online, attempting to fetch lists from server.");
             setTimeout(() => { fetchLists(); }, 150);
        } else if (currentUser) {
             console.log("useAuth: User logged in but offline, relying on local data initially. Sync prompt will appear if actions are pending.");
        }


    }, [t, isOnline, socket, isSocketAttempted, setIsSocketAttempted, setLists, setPendingActions, setCurrentView, setAuthError, setCurrentUser, fetchLists]); // ADDED isSocketAttempted dependency


    // Handler for logging out the user.
    const handleLogout = useCallback(async (msgKey = null) => {
        const message = msgKey ? t(msgKey) : t('logout_successful');
        console.log("useAuth: Executing handleLogout:", message);

        setCurrentUser(null);
        setError(null);
        setAuthError(message);

        setLists([]);
        setPendingActions([]);

        setCurrentView('login');

        offlineService.storeLists([]);
        offlineService.clearPendingActions();

        if (socket.connected) {
            console.log("useAuth: Disconnecting socket during logout.");
             socket.disconnect();
        }
        setIsSocketAttempted(false);

        if (API_URL) {
             await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
                 .then(() => { console.log("useAuth: Logout API call successful."); })
                 .catch(err => { console.error("useAuth: Logout API call failed:", err); });
        } else {
             console.warn("useAuth: API_URL not defined, skipping logout API call.");
        }

    }, [API_URL, t, socket, setIsSocketAttempted, setLists, setPendingActions, setCurrentView, setError, setAuthError, setCurrentUser]);


    // Effect to perform the initial authentication check when the hook mounts.
    useEffect(() => {
        console.log("useAuth: Initial auth check effect running...");
        const checkAuthAndLoadData = async () => {
             if (!API_URL) {
                 console.error("useAuth: API_URL is not defined. Cannot perform auth check.");
                 setIsAuthLoading(false);
                 setError(t('config_error_api_url'));
                 setCurrentView('login');
                 return;
             }

            try {
                 setIsAuthLoading(true);

                 console.log("useAuth: Fetching /api/auth/check...");
                 const res = await fetch(`${API_URL}/api/auth/check`, { credentials: 'include' });
                 console.log(`useAuth: Auth check response status: ${res.status}`);
                 const data = await res.json().catch(() => ({}));

                 if (res.ok && data.user) {
                     console.log("useAuth: Auth check successful. User found:", data.user.username);
                     setCurrentUser(data.user);

                     const storedLists = offlineService.getStoredLists();
                     const pending = offlineService.getPendingActions();
                     console.log(`useAuth: Loaded ${storedLists.length} lists and ${pending.length} pending actions from local storage after auth check.`);
                     setLists(storedLists);
                     setPendingActions(pending);

                     setCurrentView('lists');

                     // If online and not already connected, attempt to connect the socket.
                     // Check both isOnline AND if an attempt hasn't been made yet for this session.
                      if (isOnline && !socket.connected && !isSocketAttempted) { // READ isSocketAttempted here
                           console.log("useAuth: Auth check successful, online, attempting socket connect.");
                           socket.connect();
                           setIsSocketAttempted(true); // Use setter
                      } else if (!isOnline) {
                           console.log("useAuth: Auth check successful but offline, skipping socket connect attempt for now.");
                      } else if (socket.connected) {
                           console.log("useAuth: Auth check successful, socket already connected.");
                           setIsSocketAttempted(true); // Ensure this is true if already connected
                      }


                 } else {
                     console.log(`useAuth: Auth check failed (${res.status}):`, data.message || 'No user data returned.');
                     setCurrentUser(null);
                     offlineService.storeLists([]);
                     offlineService.clearPendingActions();
                     setLists([]);
                     setPendingActions([]);
                     setAuthError(data.message || t('auth_check_failed_generic'));
                     setCurrentView('login');
                 }
            } catch (err) {
                console.error("useAuth: Error during initial authentication check:", err);
                setCurrentUser(null);
                offlineService.storeLists([]);
                offlineService.clearPendingActions();
                setLists([]);
                setPendingActions([]);
                setAuthError(t('auth_check_failed_network', { message: err.message }));
                 setCurrentView('login');
            } finally {
                console.log("useAuth: Initial authentication check finished.");
                setIsAuthLoading(false);
            }
        };

        checkAuthAndLoadData();

        // Dependencies: Include variables used in the effect and cleanup.
        // isSocketAttempted is READ in the effect's logic, so it's a dependency.
        // setIsSocketAttempted is a setter, which is stable.
    }, [API_URL, t, socket, isOnline, isSocketAttempted, setIsSocketAttempted, setCurrentUser, setIsAuthLoading, setAuthError, setLists, setPendingActions, setCurrentView, setError]); // ADDED isSocketAttempted dependency


    return {
        currentUser,
        isAuthLoading,
        authError,
        setAuthError,
        handleLogin,
        handleLogout,
    };
}

export default useAuth;