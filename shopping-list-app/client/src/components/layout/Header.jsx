// client/src/components/layout/Header.jsx
// Description: Fixed header component displaying navigation, status, user actions, and toggles.

import React from 'react';
import { useTranslation } from 'react-i18next';

// Import common UI components
import LanguageToggle from '../common/LanguageToggle';
import ThemeToggle from '../common/ThemeToggle';

/**
 * Header component for the application layout.
 * Displays navigation controls, status indicators, user actions, and toggles.
 *
 * @param {object} props - Props passed from the parent component (App.jsx).
 * @param {object|null} props.currentUser - The currently authenticated user object.
 * @param {string} props.currentView - The current application view ('lists', 'detail', 'admin', 'adminLogs', 'login', 'loading').
 * @param {boolean} props.isOnline - Current online status of the browser.
 * @param {boolean} props.isConnected - Current status of the socket connection.
 * @param {boolean} props.isSocketAttempted - Indicates if a socket connection has been attempted this session.
 * @param {boolean} props.isAuthLoading - Indicates if the initial auth check is in progress.
 * @param {boolean} props.isLoading - Indicates if general loading is in progress.
 * @param {boolean} props.isSyncing - Indicates if sync is in progress.
 * @param {string|null} props.error - General error message state from App.
 * @param {string|null} props.authError - Authentication-specific error message state from App.
 * @param {string} props.currentLanguage - The currently active language code.
 * @param {boolean} props.isDarkMode - Current theme state.
 * @param {Function} props.handleBackToLists - Handler to navigate back to the lists view.
 * @param {Function} props.handleExitAdminMode - Handler to exit admin mode and go back.
 * @param {Function} props.handleOpenAdminPinModal - Handler to open the admin PIN modal.
 * @param {Function} props.handleLogout - Handler for logging out the user.
 * @param {Function} props.changeLanguage - Handler to change the application language.
 * @param {Function} props.toggleTheme - Handler to toggle the application theme.
 */
function Header({
    currentUser,
    currentView,
    isOnline,
    isConnected,
    isSocketAttempted,
    isAuthLoading,
    isLoading,
    isSyncing,
    error,
    authError,
    currentLanguage,
    isDarkMode,
    handleBackToLists,
    handleExitAdminMode,
    handleOpenAdminPinModal,
    handleLogout,
    changeLanguage,
    toggleTheme,
}) {
    const { t } = useTranslation();

    // Only render the header if a user is logged in and not on the login or initial loading view
    if (!currentUser || currentView === 'login' || currentView === 'loading') {
        return null;
    }

    // Determine which back button handler to use based on the current view
    const handleBack = currentView === 'detail' ? handleBackToLists : handleExitAdminMode;
    // Determine if the back button should be shown in the current view
    const showBackButton = currentView === 'detail' || currentView === 'admin' || currentView === 'adminLogs';

    // Determine which status message to display below the header
    const statusMessage = error ? (
        <span className="text-red-600 dark:text-red-400 font-semibold">{error}</span>
    ) : authError && currentView !== 'login' ? ( // Show auth error only if not on login view and no general error
        <span className="text-red-600 dark:text-red-400 font-semibold">{authError}</span>
    ) : !isAuthLoading && !isLoading && !isSyncing ? ( // Only show connection status if not in a core loading state
        isOnline && isConnected ? (
             <span className={`transition-opacity duration-300 text-green-600 dark:text-green-400`}>{t('status_connected')}</span>
         ) : isOnline && !isConnected && isSocketAttempted ? ( // Connecting state: online, not connected, attempted
             <span className={`transition-opacity duration-300 text-yellow-600 dark:text-yellow-400`}>{t('status_connecting')}</span>
         ) : isOnline && !isConnected && !isSocketAttempted ? ( // Online but no attempt yet (less common after refactor)
             <span className={`transition-opacity duration-300 text-gray-600 dark:text-gray-400`}>{t('status_idle')}</span>
         ) : !isOnline && isSocketAttempted ? ( // Offline and attempted socket (means it disconnected)
              <span className="text-amber-600 dark:text-amber-400">{t('status_offline_mode')}</span>
         ) : !isOnline && !isSocketAttempted ? ( // Offline and no socket attempt ever (should be covered by the above)
              <span className="text-amber-600 dark:text-amber-400">{t('status_offline_mode')}</span>
         ) : null // Default or other cases
    ) : null; // Hide status message if a core loading state is active


    return (
        <>
            {/* Fixed Header Bar */}
            <div className="fixed top-0 left-0 right-0 z-20 flex justify-between items-center gap-1 sm:gap-3 p-2 sm:p-4 bg-background/80 dark:bg-dark-background/80 backdrop-blur-sm border-b border-secondary dark:border-dark-secondary">
                {/* Left section: Back button */}
                <div className="flex-1 min-w-0">
                    {showBackButton && (
                        <button
                            onClick={handleBack}
                            className="text-primary dark:text-dark-primary hover:opacity-80 transition-opacity flex items-center gap-1 text-sm sm:text-base flex-shrink-0 group p-1 rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent dark:focus:ring-dark-accent focus:ring-offset-background dark:focus:ring-offset-dark-background"
                            title={t('back_button_title', 'Go back')}
                        >
                            <span className="material-symbols-rounded text-xl leading-none">arrow_back</span>
                            {/* Hide text on small screens */}
                            <span className="hidden sm:inline group-hover:underline">{currentView === 'detail' ? t('back_to_lists') : t('back_button_label', 'Back')}</span>
                        </button>
                    )}
                </div>

                {/* Center section (currently empty, could be title) */}
                <div className="flex-1 text-center"></div>

                {/* Right section: Status, Admin, Logout, Language, Theme */}
                <div className="flex flex-1 justify-end items-center gap-1 sm:gap-3">
                    {/* Status Indicator (compact version) */}
                    {!isAuthLoading && !isLoading && !isSyncing && (
                        <>
                            {!isOnline && currentUser && ( // Offline status
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-200 shadow-sm border border-amber-300 dark:border-amber-600/50" title={t('offline_mode_active')} > <span className="material-symbols-rounded text-sm leading-none">cloud_off</span> <span className="hidden sm:inline">{t('status_offline', 'Offline')}</span> </div>
                            )}
                            {isOnline && !isConnected && isSocketAttempted && currentUser && ( // Connecting status
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200 shadow-sm border border-yellow-300 dark:border-yellow-600/50 animate-pulse" title={t('status_connecting')} > <span className="material-symbols-rounded text-sm leading-none">wifi</span> <span className="hidden sm:inline">{t('status_connecting', 'Connecting...')}</span> </div>
                            )}
                             {isOnline && isConnected && currentUser && ( // Connected status
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 shadow-sm border border-green-300 dark:border-green-600/50" title={t('status_connected')} > <span className="material-symbols-rounded text-sm leading-none">wifi</span> <span className="hidden sm:inline">{t('status_connected', 'Online')}</span> </div>
                            )}
                        </>
                    )}


                    {/* Admin Button (only shown if user is admin and not already in admin views) */}
                    {currentUser?.isAdmin && currentView !== 'admin' && currentView !== 'adminLogs' && (
                        <button
                            onClick={handleOpenAdminPinModal}
                            title={t('admin_button_title')}
                            className="p-1.5 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary dark:focus:ring-dark-primary focus:ring-offset-background dark:focus:ring-offset-dark-background"
                        >
                            <span className="material-symbols-rounded text-lg leading-none align-middle">admin_panel_settings</span>
                        </button>
                    )}

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        title={t('logout_button_title')}
                        className="p-1.5 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary dark:focus:ring-dark-primary focus:ring-offset-background dark:focus:ring-offset-dark-background"
                    >
                        <span className="material-symbols-rounded text-lg leading-none align-middle">logout</span>
                    </button>

                    {/* Language Toggle */}
                    <LanguageToggle currentLang={currentLanguage} onChangeLang={changeLanguage} />

                    {/* Theme Toggle */}
                    <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
                </div>
            </div>

            {/* Status Bar Below Header (for errors or detailed status) */}
            {/* Show this bar only if logged in and not on login/loading views */}
             {currentUser && currentView !== 'login' && currentView !== 'loading' && (
                 // Use padding top on main content to avoid header overlap
                <div className="text-center mb-4 text-xs min-h-[1.2em] px-2 pt-16 sm:pt-20"> {/* Adjust pt based on header height */}
                    {statusMessage}
                </div>
            )}
        </>
    );
}

export default Header;