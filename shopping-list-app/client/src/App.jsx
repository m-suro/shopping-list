// client/src/App.jsx
// Description: Main application component. Acts as a coordinator using custom hooks
// to manage state, logic, and render the appropriate views and components.
// Central state variables are declared here and passed to hooks.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket'; // Still import the socket instance
import { useTranslation } from 'react-i18next'; // Keep useTranslation here

// Import components from their new locations
import Login from './components/Login';
import ShoppingLists from './components/ShoppingLists';
import ShoppingListDetail from './components/ShoppingListDetail';
import AdminPanel from './components/admin/AdminPanel';
import LogViewer from './components/admin/LogViewer';

// Import modals from the modals subdirectory
import AdminPinModal from './components/modals/AdminPinModal';
import SyncPromptModal from './components/modals/SyncPromptModal';
import ShareListModal from './components/modals/ShareListModal';

// Import common UI components from the common subdirectory
import LoadingOverlay from './components/common/LoadingOverlay';
import Header from './components/layout/Header'; // Import the Header component

// Import custom hooks
import useAuth from './hooks/useAuth';
import useShoppingListData from './hooks/useShoppingListData';
import useSync from './hooks/useSync';
import useSocket from './hooks/useSocket';
import useAdmin from './hooks/useAdmin';

// Import offline service utility
import * as offlineService from './services/offlineService';


// Get API URL (still needed directly in App for passing to hooks/components)
const API_URL = import.meta.env.VITE_SERVER_URL;


// --- Main App Component ---
function App() {
    // Call useTranslation at the top level of the component
    const { t, i18n } = useTranslation();

    // --- Core Application State (Declared in App.jsx) ---
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isSocketAttempted, setIsSocketAttempted] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches);
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language.split('-')[0]);

    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    const [lists, setLists] = useState([]);
    const [currentListId, setCurrentListId] = useState(null);

    const [pendingActions, setPendingActions] = useState(() => offlineService.getPendingActions());

    const [isAdminVerified, setIsAdminVerified] = useState(false);
    const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
    const [adminPinError, setAdminPinError] = useState(null);

    const [currentView, setCurrentView] = useState('loading');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [listToShare, setListToShare] = useState(null);

    // isSyncing and showSyncPrompt states are now managed *within* useSync hook and returned.
    // Remove their useState declarations from App.


    const currentListIdRef = useRef(null);
    useEffect(() => { currentListIdRef.current = currentListId; }, [currentListId]);


    // --- App-level Handlers (Affecting App State/Views) ---

    const handleBackToLists = useCallback(() => {
        currentUser && currentListIdRef.current && isOnline && socket.connected && (console.log(`App: Leaving list room: ${currentListIdRef.current}`), socket.emit('leaveList', currentListIdRef.current));
        setCurrentListId(null);
        setCurrentView('lists');
    }, [currentUser, isOnline, socket.connected, setCurrentListId, setCurrentView]);

    const handleCloseShareModal = useCallback(() => {
        setIsShareModalOpen(false);
        setListToShare(null);
    }, [setIsShareModalOpen, setListToShare]);


    // Handler to open the Share Modal. Checks conditions using state from hooks.
    const handleOpenShareModal = useCallback((list) => {
        if (list && list._id && !list.tempId && !list.isPublic && list.owner?._id === currentUser?._id) {
            setError(null);
            setListToShare(list);
            setIsShareModalOpen(true);
        } else {
             let errorMessage = t('share_unavailable_generic');
             list?.tempId ? errorMessage = t('share_unavailable_offline_list') :
             list?.isPublic ? errorMessage = t('share_unavailable_public') :
             list?.owner?._id !== currentUser?._id ? errorMessage = t('list_sharing_not_owner') :
             !isOnline ? errorMessage = t('share_unavailable_offline') : null;

             setError(errorMessage);
             console.warn("App: Attempted to open share modal with invalid or restricted list:", list, "Reason:", errorMessage);
        }
    }, [t, isOnline, currentUser, setError, setIsShareModalOpen, setListToShare]);


    // --- Theme and Language Handlers ---
    useEffect(() => { isDarkMode ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark'); localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); }, [isDarkMode]);
    const toggleTheme = useCallback((isDark) => setIsDarkMode(isDark), [setIsDarkMode]);
    const changeLanguage = useCallback((lng) => i18n.changeLanguage(lng), [i18n]);
    useEffect(() => { const handler = (lng) => setCurrentLanguage(lng.split('-')[0]); i18n.on('languageChanged', handler); setCurrentLanguage(i18n.language.split('-')[0]); return () => i18n.off('languageChanged', handler); }, [i18n]);


    // --- Browser Online/Offline Status Effect ---
     useEffect(() => {
         const handleOnline = () => { console.log("App: Browser came online."); setIsOnline(true); };
         const handleOffline = () => { console.log("App: Browser went offline."); setIsOnline(false); };
         window.addEventListener('online', handleOnline);
         window.addEventListener('offline', handleOffline);
         setIsOnline(navigator.onLine);
         return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
     }, []);


    // --- Call Custom Hooks ---
    // Call all hooks here, passing App state and setters, and receiving hook state/handlers/derived state.
    // The order of hook calls matters for variable declaration availability below this block.

    // Shopping List Data Hook: Manages list/item state mutations, fetches, and actions.
    const {
         currentList, currentListItems, fetchLists, fetchListItems, handleSelectList,
         handleAddList, handleDeleteList, handleTogglePrivacy, handleUpdateListAllowedUsers,
         handleAddItem, handleDeleteItem, handleToggleItem, handleUpdateItemComment, handleUpdateItemQuantity,
         handleAddItemSuccess, applyAndStoreLocally // expose these for useSync
     } = useShoppingListData({
         currentUser, isOnline, isConnected, isSyncing: false, isLoading, setError, setPendingActions, setIsLoading, setCurrentView,
         handleBackToLists, // Pass stable handler from App
         socket, lists, setLists, currentListId, setCurrentListId // Pass list state and setters from App
     });


    // Sync Hook: This hook *manages* the isSyncing and showSyncPrompt states and returns them.
    // App uses these returned states directly.
      const {
         isSyncing, // Destructure isSyncing directly from the hook
         showSyncPrompt, // Destructure showSyncPrompt directly from the hook
         setShowSyncPrompt, // Expose setter from the hook for useAuth to hide prompt on logout
         handleSyncConfirm, handleSyncCancel, handleActionCompletedByServer // Handlers to expose
      } = useSync({
          isOnline, isConnected, socket, lists, setLists, error, setError,
          fetchLists, // Pass the real handler from useShoppingListData
          fetchListItems, // Pass the real handler from useShoppingListData
          currentView, currentListIdRef, handleBackToLists, // Pass the real handler from App
          handleAddItemSuccess, // Pass the real handler from useShoppingListData
          pendingActions, setPendingActions, currentUser, applyAndStoreLocally // Pass state/setters/handlers
      });


    // Auth Hook: Manages authentication checks, login/logout logic.
    const { handleLogin, handleLogout } = useAuth({
         setCurrentUser, setIsAuthLoading, setAuthError, setLists, setPendingActions,
         setCurrentView, setError, isOnline, isSocketAttempted, setIsSocketAttempted,
         fetchLists // Pass fetchLists handler from useShoppingListData
     });


    // Socket Hook: Manages socket connection and listeners.
      useSocket({
          t, // PASS 't' FUNCTION TO useSocket
          currentUser, isOnline, isSocketAttempted, setIsConnected, setIsSocketAttempted,
          setError, currentView, currentListIdRef, setLists, handleBackToLists,
          handleActionCompletedByServer, handleAddItemSuccess,
          isAuthLoading, isLoading, isSyncing, error, lists // Pass state/setters/handlers
      });


    // Admin Hook: Manages admin state, verification, and navigation.
     const {
         handleOpenAdminPinModal, handleVerifyAdminPin, handleExitAdminMode, handleNavigateToLogs
     } = useAdmin({
         isAdminVerified, // Pass state to hook
         setIsLoading, setError, setCurrentView,
         setIsAdminVerified, setIsAdminPinModalOpen, setAdminPinError
     });


    // --- Effect to trigger data fetching on connection/authentication ---
    // This effect replaces the fetch calls previously inside useSocket's onConnect.
    useEffect(() => {
         console.log(`App Fetch Effect: Connected=${isConnected}, User=${!!currentUser?.username}, AuthLoading=${isAuthLoading}, Loading=${isLoading}, Syncing=${isSyncing}, View=${currentView}`);
         // Trigger fetches when connected AND authenticated AND not already in a loading/sync state
         // AND not in the initial auth loading phase.
         if (isConnected && currentUser && !isAuthLoading && !isLoading && !isSyncing) {
             console.log("App Fetch Effect: Conditions met. Triggering data fetches.");
             fetchLists(); // Fetch list metadata

              // If currently in a list detail view, also fetch items for that list
             if (currentView === 'detail' && currentListIdRef.current) {
                  // Add a small delay to let fetchLists potentially complete first
                 setTimeout(() => {
                     fetchListItems(currentListIdRef.current);
                 }, 100);
             }
         } else if (isConnected && !currentUser) {
             console.log("App Fetch Effect: Connected but no user. Fetching skipped.");
         } else if (!isConnected && currentUser) {
             console.log("App Fetch Effect: User logged in but not connected. Fetching skipped (relying on local data).");
         } else {
             console.log("App Fetch Effect: Conditions not met for fetching.");
         }

         // Dependencies: States and handlers that dictate when fetching should occur.
    }, [isConnected, currentUser, isAuthLoading, isLoading, isSyncing, fetchLists, fetchListItems, currentView, currentListIdRef]);


    // --- Derived State ---
    // Calculated using state variables that are now available in scope (from useState or hook returns).
    // This section must come AFTER all hook calls that define the variables used here.

    const showLoadingOverlay = isAuthLoading || isLoading || isSyncing; // Uses isAuthLoading (useState), isLoading (useState), isSyncing (from useSync)


    // --- Debugging Logs for Loading States ---
    // This effect must come *after* all hooks that define the loading states it depends on.
    useEffect(() => {
        console.log(`App: Loading State Update: isAuthLoading=${isAuthLoading}, isLoading=${isLoading}, isSyncing=${isSyncing}, showOverlay=${isAuthLoading || isLoading || isSyncing}`);
    }, [isAuthLoading, isLoading, isSyncing]); // Dependencies are correctly the variables available in scope

    useEffect(() => {
        console.log("App: Checking for stuck loading state...");
        // Check for authentication completion signals
        const authComplete = 
            // Auth check finished message appears in logs
            console.logs?.some(log => log.includes("Initial authentication check finished"));
        
        if (authComplete && isAuthLoading) {
            console.log("App: Detected auth check completion with stuck loading state, forcing reset");
            // Force reset the loading state
            setIsAuthLoading(false);
        }
    }, [isAuthLoading]);


    // --- Render Logic ---
    const renderContent = () => {
        if (!currentUser && !isAuthLoading) {
            console.log("FORCE RENDERING LOGIN COMPONENT");
            return <Login onLogin={handleLogin} error={authError} setError={setAuthError} />;
        }
        console.log("Debug render state:", {
            currentUser: currentUser,
            currentView: currentView, 
            isAuthLoading: isAuthLoading,
            authError: authError
        });
        if (isAuthLoading) {
             return (
                 <div className="flex flex-col items-center justify-center min-h-screen p-10 text-gray-500 dark:text-gray-400">
                     <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary dark:border-dark-primary mb-4"></div>
                     <span>{t('authenticating_loading')}</span>
                 </div>
             );
        }

        if (!currentUser && !isAuthLoading) {
            console.log("App: User not authenticated and auth loading complete, showing login page");
            return <Login onLogin={handleLogin} error={authError} setError={setAuthError} />;
        }

        switch (currentView) {
            case 'lists':
                 return <ShoppingLists lists={lists} onSelectList={handleSelectList} onAddList={handleAddList} currentUser={currentUser} />;

            case 'detail':
                 if ((!currentList || !Array.isArray(currentList.items) || currentList.items.length === 0) && isLoading && currentListId) {
                      console.log(`App: Rendering detail loading state for list ${currentListId}. List exists: ${!!currentList}, Items exist: ${!!currentList?.items}, Items length: ${currentList?.items?.length}, isLoading: ${isLoading}`);
                      return (
                         <div className="flex flex-col items-center justify-center p-10 text-gray-500 dark:text-gray-400">
                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary mb-3"></div>
                             <span>{t('loading_items')}</span>
                         </div>
                     );
                 }
                return currentList ? (
                    <ShoppingListDetail
                        key={currentList._id || currentList.tempId}
                        list={currentList} items={currentListItems} currentUser={currentUser}
                        isOnline={isOnline}
                        onBack={handleBackToLists}
                        onDeleteList={handleDeleteList}
                        onError={setError}
                        onTogglePrivacy={handleTogglePrivacy}
                        onUpdateComment={handleUpdateItemComment}
                        onUpdateItemQuantity={handleUpdateItemQuantity}
                        onItemAdd={handleAddItem}
                        onItemDelete={handleDeleteItem}
                        onItemToggle={handleToggleItem}
                        onOpenShareModal={() => handleOpenShareModal(currentList)}
                    />
                ) : (
                     <div className="text-center p-10">
                        <p className="text-red-500 dark:text-red-400 mb-4">{error || t('list_not_found_or_deleted', 'List not found or it may have been deleted.')}</p>
                        <button onClick={handleBackToLists} className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity">
                            {t('back_to_lists')}
                        </button>
                    </div>
                );

            case 'admin':
                 if (!isAdminVerified) {
                     console.warn("App: Attempted to render admin view without verification. Falling back.");
                     handleBackToLists();
                     return null;
                 }
                 return <AdminPanel onExitAdminMode={handleExitAdminMode} onNavigateToLogs={handleNavigateToLogs} />;

            case 'adminLogs':
                 if (!isAdminVerified) {
                     console.warn("App: Attempted to render admin logs without verification. Falling back.");
                     handleBackToLists();
                     return null;
                 }
                 return <LogViewer onExit={handleExitAdminMode} />;

             case 'loading':
                  // Initial loading view handled by isAuthLoading check.
                  // If somehow reach here without isAuthLoading true, show auth loading fallback.
                   // This case should ideally be unreachable if isAuthLoading logic works correctly.
                   return (
                       <div className="flex flex-col items-center justify-center min-h-screen p-10 text-gray-500 dark:text-gray-400">
                           <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary dark:border-dark-primary mb-4"></div>
                           <span>{t('authenticating_loading')}</span> {/* Generic loading message */}
                       </div>
                   );


            default:
                 console.warn(`App: Unknown view state: ${currentView}, falling back to lists.`);
                 setCurrentView('lists');
                 return null;
        }
    };

    // --- Main Component JSX Return ---
    return (
        <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">

            {/* --- Loading Overlay --- */}
            {/* Show overlay if any of the core loading indicators are true */}
            {showLoadingOverlay && <LoadingOverlay />}

             {/* --- Header --- */}
             {/* Pass all necessary state and handlers from App and hooks */}
             <Header
                 currentUser={currentUser} currentView={currentView}
                 isOnline={isOnline} isConnected={isConnected} isSocketAttempted={isSocketAttempted}
                 isAuthLoading={isAuthLoading} isLoading={isLoading} isSyncing={isSyncing} // Pass isSyncing from useSync return
                 error={error} authError={authError}
                 currentLanguage={currentLanguage} isDarkMode={isDarkMode}
                 handleBackToLists={handleBackToLists} handleExitAdminMode={handleExitAdminMode}
                 handleOpenAdminPinModal={handleOpenAdminPinModal} handleLogout={handleLogout}
                 changeLanguage={changeLanguage} toggleTheme={toggleTheme}
                 isAdmin={currentUser?.isAdmin}
             />

            {/* --- Main Content Area --- */}
            <main className="max-w-4xl mx-auto p-4 pt-20 sm:pt-24"> {/* Example padding */}
                {renderContent()}
            </main>

            {/* --- Modals --- */}
            {/* Pass necessary state and handlers from App and hooks */}
            <AdminPinModal
                isOpen={isAdminPinModalOpen} // State from App
                onClose={() => { setIsAdminPinModalOpen(false); setAdminPinError(null); }} // App state setters
                onVerify={handleVerifyAdminPin} // Handler from useAdmin
                error={adminPinError} // State from App
                setError={setAdminPinError} // Setter from App
            />
            <SyncPromptModal
                isOpen={showSyncPrompt} // State from useSync return
                onClose={handleSyncCancel} // Handler from useSync
                onConfirmSync={handleSyncConfirm} // Handler from useSync
                pendingActionCount={Array.isArray(pendingActions) ? pendingActions.length : 0} // State from App
                isSyncing={isSyncing} // State from useSync
            />
            {listToShare && (
                 <ShareListModal
                     isOpen={isShareModalOpen} onClose={handleCloseShareModal} // App state and handler
                     list={listToShare} // App state
                     currentUser={currentUser} isOnline={isOnline} // State from App
                     onUpdateAllowedUsers={handleUpdateListAllowedUsers} onError={setError} // Handlers/setters from useShoppingListData/App
                 />
             )}

        </div>
    );
}

export default App;