// client/src/App.jsx
// Description: Main application component handling state, routing, socket connections,
// offline logic, sync, authentication, and rendering core UI views including Admin Logs.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';
import AdminPinModal from './AdminPinModal';
import AdminPanel from './AdminPanel';
import LogViewer from './LogViewer'; // ** Import LogViewer **
import ShoppingListDetail from './ShoppingListDetail';
import * as offlineService from './services/offlineService';
import SyncPromptModal from './components/SyncPromptModal';

// --- Helper Components ---
function LoadingOverlay() {
    return (
        <div className="fixed inset-0 bg-background/70 dark:bg-dark-background/70 backdrop-blur-sm flex justify-center items-center z-[999]">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary dark:border-dark-primary"></div>
        </div>
    );
}

function SegmentedControl({ options, currentValue, onChange, ariaLabel }) {
    return (
        <div className="inline-flex rounded-lg shadow-sm bg-gray-200 dark:bg-gray-700 p-0.5" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out focus:z-10 focus:ring-2 focus:ring-offset-1 focus:ring-accent dark:focus:ring-dark-accent focus:ring-offset-gray-200 dark:focus:ring-offset-gray-700 outline-none flex items-center justify-center h-8 w-10 ${currentValue === option.value ? 'bg-white dark:bg-gray-500 shadow' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    aria-pressed={currentValue === option.value}
                >
                    <span className={`transition-opacity duration-150 ${currentValue === option.value ? 'opacity-100' : 'opacity-75 hover:opacity-100'}`}>{option.icon}</span>
                </button>
            ))}
        </div>
    );
}

function ThemeToggle({ isDarkMode, onToggle }) {
    const { t } = useTranslation();
    const themeOptions = [
        { value: 'light', icon: <span className="material-symbols-rounded text-lg leading-none">light_mode</span> },
        { value: 'dark', icon: <span className="material-symbols-rounded text-lg leading-none">dark_mode</span> }
    ];
    return <SegmentedControl options={themeOptions} currentValue={isDarkMode ? 'dark' : 'light'} onChange={(value) => onToggle(value === 'dark')} ariaLabel={t('theme_toggle_aria_label')} />;
}

function LanguageToggle({ currentLang, onChangeLang }) {
    const { t } = useTranslation();
    const languageOptions = [
        { value: 'en', icon: <img src="/USA.png" alt="USA Flag" className="w-5 h-auto" /> },
        { value: 'pl', icon: <img src="/Poland.png" alt="Poland Flag" className="w-5 h-auto" /> }
    ];
    return <SegmentedControl options={languageOptions} currentValue={currentLang} onChange={onChangeLang} ariaLabel={t('language_toggle_aria_label')} />;
}

function AddListModal({ isOpen, onClose, onAddList }) {
    const { t } = useTranslation();
    const [listName, setListName] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const inputRef = useRef(null);
    const [parent] = useAutoAnimate();

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => { inputRef.current?.focus(); }, 50);
            setListName(''); setIsPublic(false);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = (e) => { e.preventDefault(); onAddList(listName.trim(), isPublic); onClose(); };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-list-modal-title">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter" onClick={(e) => e.stopPropagation()} ref={parent}>
                <h2 id="add-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">{t('create_list_button')}</h2>
                <form onSubmit={handleSubmit}>
                    <input ref={inputRef} type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder={t('new_list_placeholder')} className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent mb-4" aria-label={t('new_list_placeholder')} maxLength={100}/>
                    <div className="mb-4 flex items-center justify-start gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                        <label htmlFor="list-privacy-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex items-center gap-2">
                            <span className={`material-symbols-rounded text-lg ${isPublic ? 'text-blue-500' : 'text-yellow-600'}`}>{isPublic ? 'public' : 'lock'}</span> {isPublic ? t('list_privacy_public') : t('list_privacy_private')}
                        </label>
                        <button type="button" id="list-privacy-toggle" onClick={() => setIsPublic(!isPublic)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-700 focus:ring-primary dark:focus:ring-dark-primary ${isPublic ? 'bg-blue-500' : 'bg-gray-400 dark:bg-gray-500'}`} aria-pressed={isPublic} aria-label={t('list_privacy_toggle_label')}>
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${isPublic ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink min-w-0">({isPublic ? t('list_public_info_short') : t('list_private_info_short')})</span>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity">{t('cancel_button')}</button>
                        <button type="submit" className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity">{t('create_button')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ShoppingLists({ lists, onSelectList, onAddList }) {
    const { t } = useTranslation();
    const [listAnimationParent] = useAutoAnimate();
    const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);

    const handleOpenModal = () => setIsAddListModalOpen(true);
    const handleCloseModal = () => setIsAddListModalOpen(false);
    const handleAddListAndCloseModal = (name, isPublic) => { onAddList(name, isPublic); handleCloseModal(); };

    const sortedLists = useMemo(() => { if (!Array.isArray(lists)) return []; return [...lists].sort((a, b) => (a.name || '').localeCompare(b.name || '')); }, [lists]);

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <h1 className="text-3xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('app_title')}</h1>
            {(lists || []).length === 0 ? <p className="text-center text-gray-500 dark:text-gray-400">{t('no_lists_message')}</p> : (
                <ul ref={listAnimationParent} className="space-y-2 list-none p-0 mb-6">
                    {sortedLists.map(list => (
                        <li key={list._id || list.tempId} className="flex justify-between items-center p-3 bg-secondary/30 dark:bg-dark-secondary/30 rounded cursor-pointer hover:bg-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors" onClick={() => onSelectList(list._id || list.tempId)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectList(list._id || list.tempId)}>
                            <div className="flex items-center gap-2 min-w-0 mr-2">
                                <span title={list.isPublic ? t('list_status_public') : t('list_status_private')} className={`material-symbols-rounded text-base ${list.isPublic ? 'text-blue-500' : 'text-yellow-600'}`} aria-hidden="true">{list.isPublic ? 'public' : 'lock'}</span>
                                <span className="font-medium text-text dark:text-dark-text break-words truncate">{list.name}</span>
                                {list.isOffline && <span className="material-symbols-rounded text-xs text-amber-500 ml-1 flex-shrink-0" title={t('offline_change_tooltip')}>cloud_off</span>}
                                {list?.owner?.username && <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">({list.owner.username})</span>}
                            </div>
                            <span className="material-symbols-rounded text-primary dark:text-dark-primary flex-shrink-0" aria-hidden="true">chevron_right</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-6 pt-4 border-t border-secondary dark:border-dark-secondary flex justify-center">
                <button type="button" onClick={handleOpenModal} className="w-full sm:w-auto px-5 py-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                    <span className="material-symbols-rounded">add</span>{t('create_list_button')}
                </button>
            </div>
            <AddListModal isOpen={isAddListModalOpen} onClose={handleCloseModal} onAddList={handleAddListAndCloseModal} />
        </div>
    );
}

function Login({ onLogin, error, setError }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState(''); const [pin, setPin] = useState(''); const [isLoading, setIsLoading] = useState(false); const API_URL = import.meta.env.VITE_SERVER_URL;
    const handleSubmit = async (e) => { e.preventDefault(); if (!username || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError(t('login_invalid_input')); return; } setIsLoading(true); setError(null); try { const res = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, pin }), credentials: 'include' }); const data = await res.json(); if (!res.ok) throw new Error(data.message || t('login_failed_generic')); onLogin(data); } catch (err) { setError(err.message || t('login_failed_generic')); } finally { setIsLoading(false); } };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4">
            <div className="w-full max-w-xs p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('login_title')}</h1> {error && <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm">{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4"> <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('username_label')}</label> <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent" autoCapitalize="none"/> </div>
                    <div className="mb-6"> <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('pin_label')}</label> <input type="password" id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g,''))} required maxLength="4" minLength="4" inputMode="numeric" pattern="\d{4}" className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"/> </div>
                    <button type="submit" disabled={isLoading} className="w-full px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center"> {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : t('login_button')} </button>
                </form>
            </div>
        </div>
    );
}

// --- Main App Component ---
function App() {
    const { t, i18n } = useTranslation();
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isOnline, setIsOnline] = useState(true);
    const [isSocketAttempted, setIsSocketAttempted] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => { const stored = localStorage.getItem('theme'); return stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches); });
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language.split('-')[0]);
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState(null);
    const [lists, setLists] = useState([]);
    const [currentListId, setCurrentListId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [currentView, setCurrentView] = useState('login');
    const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
    const [isAdminVerified, setIsAdminVerified] = useState(false);
    const [adminPinError, setAdminPinError] = useState(null);
    const [pendingActions, setPendingActions] = useState(() => offlineService.getPendingActions());
    const [showSyncPrompt, setShowSyncPrompt] = useState(false);

    // Refs
    const currentListIdRef = useRef(currentListId);
    const isLoadingRef = useRef(isLoading);
    const isSyncingRef = useRef(isSyncing);
    // *** FIX: Define isMountedRef at the top level ***
    const isMountedRef = useRef(true);

    // Keep refs updated
    useEffect(() => { currentListIdRef.current = currentListId; }, [currentListId]);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
    useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
    // *** FIX: Manage isMountedRef with a top-level effect ***
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []); // Empty dependency array ensures this runs only on mount and unmount


    const API_URL = import.meta.env.VITE_SERVER_URL;

    // Theme and Language Effects
    useEffect(() => { if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); } else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); } }, [isDarkMode]);
    const toggleTheme = (isDark) => setIsDarkMode(isDark);
    const changeLanguage = (lng) => i18n.changeLanguage(lng);
    useEffect(() => { const handler = (lng) => setCurrentLanguage(lng.split('-')[0]); i18n.on('languageChanged', handler); setCurrentLanguage(i18n.language.split('-')[0]); return () => i18n.off('languageChanged', handler); }, [i18n]);

    // --- Refined Online Status Effect ---
    useEffect(() => {
        let onlineStatus = navigator.onLine;
        if (currentUser && isSocketAttempted) { onlineStatus = isConnected; }
        setIsOnline(onlineStatus);
        const handleBrowserOnline = () => { if (!socket.connected && currentUser && isSocketAttempted) { console.log("Browser online, attempting socket reconnect."); socket.connect(); } setIsOnline(true); };
        const handleBrowserOffline = () => { console.log("Browser offline event."); setIsOnline(false); };
        window.addEventListener('online', handleBrowserOnline); window.addEventListener('offline', handleBrowserOffline);
        return () => { window.removeEventListener('online', handleBrowserOnline); window.removeEventListener('offline', handleBrowserOffline); };
    }, [isConnected, isSocketAttempted, currentUser]);


    // --- Logout Function ---
    const handleLogout = useCallback(async (msgKey = null) => {
        const message = msgKey ? t(msgKey) : t('logout_successful');
        setError(null); setAuthError(message); setCurrentUser(null); setLists([]); setCurrentListId(null); setIsAdminVerified(false); setIsAdminPinModalOpen(false); setAdminPinError(null); setCurrentView('login'); setShowSyncPrompt(false); setIsSyncing(false); offlineService.storeLists([]); offlineService.clearPendingActions(); setPendingActions([]); setIsSocketAttempted(false);
        if (socket.connected) socket.disconnect(); if (API_URL) { try { await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (err) { console.error("Logout API failed:", err); } }
    }, [API_URL, t]);


    // --- handleBackToLists ---
    const handleBackToLists = useCallback(() => {
        if (!currentUser) return; if (currentListIdRef.current && socket.connected) { socket.emit('leaveList', currentListIdRef.current); } setCurrentListId(null); setError(null); setCurrentView('lists');
    }, [currentUser, socket]);


    // --- Fetch Lists ---
    const fetchLists = useCallback(async (calledDuringSync = false) => {
        if (!currentUser || !API_URL) { console.log("FetchLists skipped: no user or API_URL."); return; }
        if (!socket.connected && !calledDuringSync) { console.log("FetchLists skipped: not connected and not during sync."); return; }
        if (isLoadingRef.current || isSyncingRef.current) { console.log(`FetchLists skipped: already loading (${isLoadingRef.current}) or syncing (${isSyncingRef.current}).`); return; }

        console.log("Fetching lists (with items) from server...");
        setIsLoading(true); setError(null);
        try {
            const res = await fetch(`${API_URL}/api/lists`, { credentials: 'include' });
            if (!res.ok) { const data = await res.json().catch(() => ({})); if (res.status === 401) { handleLogout('session_expired_error'); } else { throw new Error(data.message || t('error_fetching_lists')); } return; }
            const serverLists = await res.json(); const cleanServerLists = (serverLists || []).map(list => ({ ...list, isOffline: false, items: (list.items || []).map(item => ({ ...item, isOffline: false })) }));
            if (isMountedRef.current) { // Check mount before setting state
                 setLists(cleanServerLists);
                 setError(null);
            }
            offlineService.storeLists(cleanServerLists); console.log("Lists fetched and stored locally.");
        } catch (err) { console.error("Error fetching lists:", err); if (isMountedRef.current) setError(err.message);
        } finally { if (isMountedRef.current) setIsLoading(false); }
    }, [API_URL, currentUser, handleLogout, t, socket]); // Removed setters


    // --- Socket Event Handlers ---
    const onListsUpdated = useCallback((updatedList) => { console.log("Socket: listsUpdated"); if (!isMountedRef.current) return; setError(null); setLists(currentLists => { const safeLists = currentLists || []; let newLists; if (safeLists.some(l => l._id === updatedList._id)) { newLists = safeLists.map(list => list._id === updatedList._id ? { ...list, ...updatedList, items: (updatedList.items || []).map(item => ({ ...item, isOffline: false })), isOffline: false } : list); } else { newLists = [...safeLists, { ...updatedList, items: (updatedList.items || []).map(item => ({ ...item, isOffline: false })), isOffline: false }]; } offlineService.storeLists(newLists); return newLists; }); }, [setError, setLists]);
    const onListDeleted = useCallback((id) => { console.log("Socket: listDeleted"); if (!isMountedRef.current) return; setError(null); setLists(currentLists => { const newLists = (currentLists || []).filter(l => l._id !== id); if (newLists.length < (currentLists || []).length) { offlineService.storeLists(newLists); } return newLists; }); if (currentListIdRef.current === id) { handleBackToLists(); } }, [setError, setLists, handleBackToLists]);
    const onItemAdded = useCallback((newItem) => { console.log("Socket: itemAdded"); if (!isMountedRef.current || !newItem || !newItem.listId || !newItem._id) return; setError(null); setLists(currentLists => { const listIndex = (currentLists || []).findIndex(l => l._id === newItem.listId); if (listIndex === -1) return currentLists; const targetList = currentLists[listIndex]; const currentItems = targetList.items || []; const updatedItems = [...currentItems]; const newItemFromServer = { ...newItem, isOffline: false }; if (!updatedItems.some(item => item._id === newItemFromServer._id)) { updatedItems.push(newItemFromServer); const updatedList = { ...targetList, items: updatedItems, isOffline: false }; const newLists = [...currentLists]; newLists[listIndex] = updatedList; offlineService.storeLists(newLists); return newLists; } return currentLists; }); }, [setError, setLists]);
    const onItemUpdated = useCallback((updatedItem) => { console.log("Socket: itemUpdated"); if (!isMountedRef.current || !updatedItem || !updatedItem.listId || !updatedItem._id) return; setError(null); setLists(currentLists => { const listIndex = (currentLists || []).findIndex(l => l._id === updatedItem.listId); if (listIndex === -1) return currentLists; const targetList = currentLists[listIndex]; const currentItems = targetList.items || []; let itemFound = false; const updatedItemFromServer = { ...updatedItem, isOffline: false }; const updatedItems = currentItems.map(item => { if (item._id === updatedItemFromServer._id) { itemFound = true; return {...item, ...updatedItemFromServer, isOffline: false}; } return item; }); if (itemFound) { const updatedList = { ...targetList, items: updatedItems, isOffline: false }; const newLists = [...currentLists]; newLists[listIndex] = updatedList; offlineService.storeLists(newLists); return newLists; } return currentLists; }); }, [setError, setLists]);
    const onItemDeleted = useCallback(({ listId: lid, itemId }) => { console.log("Socket: itemDeleted"); if (!isMountedRef.current || !lid || !itemId) return; setError(null); setLists(currentLists => { const listIndex = (currentLists || []).findIndex(l => l._id === lid); if (listIndex === -1) return currentLists; const targetList = currentLists[listIndex]; const currentItems = targetList.items || []; const updatedItems = currentItems.filter(item => item._id !== itemId); if (updatedItems.length < currentItems.length) { const updatedList = { ...targetList, items: updatedItems, isOffline: false }; const newLists = [...currentLists]; newLists[listIndex] = updatedList; offlineService.storeLists(newLists); return newLists; } return currentLists; }); }, [setError, setLists]);


    // --- Initial Load Effect ---
    useEffect(() => {
        let isEffectMounted = true; // Local mounted flag for this effect instance
        const check = async () => {
            console.log("Initial Load Effect: Running check...");
             // Use the top-level isMountedRef for state updates inside async ops
            if (isMountedRef.current) { setIsAuthLoading(true); setAuthError(null); }
            try {
                const storedLists = offlineService.getStoredLists(); const storedActions = offlineService.getPendingActions();
                if (isMountedRef.current) { setLists(storedLists); setPendingActions(storedActions); console.log(`Initial Load: ${storedLists.length} lists, ${storedActions.length} actions loaded.`); }
            } catch (storageError) { console.error("Initial Load: Storage error:", storageError); if (isMountedRef.current) { setLists([]); setPendingActions([]); } }

            if (!API_URL) { console.error("Initial Load: API_URL missing."); if (isMountedRef.current) { setAuthError("Config Error: Server URL missing."); setCurrentUser(null); setCurrentView('login'); setIsSocketAttempted(true); } }
            else {
                try {
                    console.log("Initial Load: Checking session..."); const res = await fetch(`${API_URL}/api/auth/session`, { credentials: 'include' }); console.log(`Initial Load: Session status: ${res.status}`);
                    if (!isEffectMounted || !isMountedRef.current) return; // Check both flags before state update
                    if (res.status === 401) { console.log("Initial Load: Session invalid (401)."); setCurrentUser(null); setCurrentView('login'); if (socket.connected) socket.disconnect(); setIsSocketAttempted(true); }
                    else if (res.ok) {
                        const data = await res.json(); setCurrentUser(data); setCurrentView('lists'); console.log(`Initial Load: User ${data.username} authenticated.`);
                        if (!socket.connected) { console.log("Initial Load: Triggering socket connection..."); socket.connect(); }
                        else { console.log("Initial Load: Socket already connected."); setIsConnected(true); setIsSocketAttempted(true); }
                    } else { const errorData = await res.json().catch(() => ({})); throw new Error(errorData.message || `Session check failed ${res.status}`); }
                } catch (err) { console.error("Initial Load: Session check failed:", err); if (isMountedRef.current) { setAuthError(err.message || t('network_error')); setCurrentUser(null); setCurrentView('login'); if (socket.connected) socket.disconnect(); setIsSocketAttempted(true); } }
            }
        };

        check().finally(() => { if (isMountedRef.current) { console.log("Initial Load Effect: Finished."); setIsAuthLoading(false); } });
        return () => { isEffectMounted = false; }; // Use local flag for effect cleanup
    }, [API_URL, t, handleLogout]);


    // --- Socket Connection/Event Listener Effect ---
    useEffect(() => {
        if (!currentUser) { if (socket.connected) { socket.disconnect(); setIsConnected(false); } return; }
        console.log("Socket Listener Effect: Setting up listeners...");

        const handleConnect = () => {
             console.log('Socket connected'); if (!isMountedRef.current) return; setIsConnected(true); setIsSocketAttempted(true); setError(null);
             setTimeout(() => {
                 if (!isMountedRef.current) return; // Check mount again inside timeout
                 const currentIsLoading = isLoadingRef.current; const currentIsSyncing = isSyncingRef.current; const actionsAfterDelay = offlineService.getPendingActions();
                 setPendingActions(actionsAfterDelay);
                 if (actionsAfterDelay.length > 0 && !currentIsSyncing) { console.log('Post-Connect: Pending actions, showing sync prompt.'); setShowSyncPrompt(true); }
                 else if (!currentIsLoading && !currentIsSyncing) { console.log('Post-Connect: No pending actions, fetching lists.'); fetchLists(); }
                 else { console.log('Post-Connect: Action/fetch deferred.'); }
             }, 150);
             if (currentListIdRef.current) { console.log(`Re-joining list ${currentListIdRef.current}`); socket.emit('joinList', currentListIdRef.current); }
        };
        const handleDisconnect = (reason) => {
            console.log('Socket disconnected:', reason); if (!isMountedRef.current) return; setIsConnected(false);
            if (reason === 'io server disconnect' && !isAuthLoading) { handleLogout('session_expired_error'); }
            else if (reason !== 'io client disconnect' && currentView !== 'login') { setError(t('connection_lost_error')); }
        };
        const handleConnectError = (err) => {
            console.error('Socket connection error:', err); if (!isMountedRef.current) return; setIsConnected(false); setIsSocketAttempted(true);
             if ((err.message.includes('Authentication error') || err.message.includes('Unauthorized')) && !isAuthLoading) { handleLogout('authentication_error'); }
             else if (currentView !== 'login') { setError(t('connection_failed_error', { message: err.message })); }
        };

        // Attach listeners
        socket.on('connect', handleConnect); socket.on('disconnect', handleDisconnect); socket.on('connect_error', handleConnectError);
        socket.on('listsUpdated', onListsUpdated); socket.on('listDeleted', onListDeleted); socket.on('itemAdded', onItemAdded); socket.on('itemUpdated', onItemUpdated); socket.on('itemDeleted', onItemDeleted);

        return () => {
            console.log("Cleaning up socket listeners...");
            socket.off('connect', handleConnect); socket.off('disconnect', handleDisconnect); socket.off('connect_error', handleConnectError);
            socket.off('listsUpdated', onListsUpdated); socket.off('listDeleted', onListDeleted); socket.off('itemAdded', onItemAdded); socket.off('itemUpdated', onItemUpdated); socket.off('itemDeleted', onItemDeleted);
        };
    }, [ currentUser, isAuthLoading, currentView, t, handleLogout, fetchLists, onListsUpdated, onListDeleted, onItemAdded, onItemUpdated, onItemDeleted, setError, setIsConnected, setIsSocketAttempted, setPendingActions, setShowSyncPrompt ]);


    // --- Item Actions Queueing ---
    const queueItemAction = useCallback((action) => { console.log("Queueing item action:", action); const safeLists = lists || []; const newListsState = offlineService.applyActionLocally(safeLists, action); setLists(newListsState); const actionToQueue = { ...action, id: crypto.randomUUID() }; const updatedQueue = offlineService.addPendingAction(actionToQueue); setPendingActions(updatedQueue); setError(null); }, [lists, setError, setLists, setPendingActions]);


    // --- Action Handlers ---
    const handleLogin = (userData) => { setAuthError(null); setError(null); setCurrentUser(userData); setCurrentView('lists'); setIsSocketAttempted(false); /* Initial Load will re-run due to logout */ };
    const handleSelectList = useCallback((listId) => { if (!currentUser || currentListId === listId) return; if (currentListIdRef.current && socket.connected) { socket.emit('leaveList', currentListIdRef.current); } setError(null); setCurrentListId(listId); setCurrentView('detail'); if (socket.connected) { socket.emit('joinList', listId); } }, [currentUser, currentListId, socket, setError, setCurrentListId, setCurrentView]);
    const handleAddList = useCallback((name, isPublic) => { if (!currentUser) return; const listName = name.trim() || t('default_list_name'); if (!listName) return; const tempListId = `temp_${crypto.randomUUID()}`; const optimisticList = { _id: tempListId, tempId: tempListId, name: listName, isPublic, items: [], owner: { _id: currentUser._id, username: currentUser.username }, allowedUsers: isPublic ? [] : [currentUser._id], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOffline: true, }; const originalLists = [...(lists || [])]; const action = { type: 'addList', payload: optimisticList }; const newListsState = offlineService.applyActionLocally(lists || [], action); setLists(newListsState); const syncPayload = { name: listName, isPublic }; const syncAction = { ...action, payload: { ...syncPayload, tempId: tempListId }, id: crypto.randomUUID() }; if (socket.connected) { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); socket.emit('addList', syncPayload, (res) => { if (!isMountedRef.current) return; if (res?.error) { console.error("Server error adding list:", res.error); setError(t('error_adding_list', { message: res.error })); setLists(originalLists); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); } else if (res?.newList) { console.log("List added successfully on server:", res.newList); setError(null); setLists(prev => { const updatedLists = (prev || []).map(l => l.tempId === tempListId ? { ...res.newList, isOffline: false, tempId: undefined } : l ); if (!updatedLists.some(l => l._id === res.newList._id)) { updatedLists.push({...res.newList, isOffline: false, tempId: undefined}); } offlineService.storeLists(updatedLists); if (currentListIdRef.current === tempListId) { setCurrentListId(res.newList._id); } return updatedLists; }); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); } else { console.warn("AddList emit unexpected response:", res); setError(t('error_adding_list_unexpected')); setLists(originalLists); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); } }); } else { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); setError(null); console.log("Offline: List add action queued."); } }, [lists, currentUser, socket, t, setError, setLists, setPendingActions, setCurrentListId]);
    const handleDeleteList = useCallback((listId) => { if (!currentUser) return; const safeLists = lists || []; const listToDelete = safeLists.find(l => l._id === listId || l.tempId === listId); if (!listToDelete) return; const originalLists = [...safeLists]; const effectiveListId = listToDelete._id || listToDelete.tempId; const isTemp = !!listToDelete.tempId && !listToDelete._id; const action = { type: 'deleteList', payload: { listId: effectiveListId } }; const newListsState = offlineService.applyActionLocally(safeLists, action); setLists(newListsState); if (currentListIdRef.current === effectiveListId) { handleBackToLists(); } const syncAction = { ...action, payload: { listId: effectiveListId }, id: crypto.randomUUID() }; if (isTemp) { console.log("Locally deleting offline-only list:", effectiveListId); setError(null); setPendingActions(prev => { const filtered = prev.filter(a => !(a.type === 'addList' && a.payload.tempId === effectiveListId)); return offlineService.storePendingActions(filtered); }); offlineService.storeLists(newListsState); return; } if (socket.connected) { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); socket.emit('deleteList', effectiveListId, (res) => { if (!isMountedRef.current) return; if (res?.error) { console.error("Server error deleting list:", res.error); setError(t('error_deleting_list', { message: res.error })); setLists(originalLists); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); } else { console.log("List deleted successfully on server:", effectiveListId); setError(null); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); offlineService.storeLists(newListsState); } }); } else { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); setError(null); console.log("Offline: List delete action queued."); offlineService.storeLists(newListsState); } }, [lists, currentUser, socket, t, handleBackToLists, setError, setLists, setPendingActions]);
    const handleTogglePrivacy = useCallback((listId) => { const safeLists = lists || []; const list = safeLists.find(l => l._id === listId || l.tempId === listId); if (!list || !currentUser || list.owner?._id !== currentUser._id) return; if (list.tempId && !list._id) { setError(t('offline_privacy_toggle_not_allowed')); return; } const effectiveListId = list._id; if (!effectiveListId) { setError(t('error_updating_list', { message: "Cannot toggle privacy on unsynced list." })); return; } const newPrivacy = !list.isPublic; const originalLists = [...safeLists]; const action = { type: 'toggleListPrivacy', payload: { listId: effectiveListId, isPublic: newPrivacy } }; const newListsState = offlineService.applyActionLocally(safeLists, action); setLists(newListsState); const syncAction = { ...action, payload: { listId: effectiveListId, isPublic: newPrivacy }, id: crypto.randomUUID() }; if (socket.connected) { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); socket.emit('toggleListPrivacy', effectiveListId, (res) => { if (!isMountedRef.current) return; if (res?.error) { console.error("Server error toggling privacy:", res.error); setError(t('error_updating_list', { message: res.error })); setLists(originalLists); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); } else { console.log("Privacy toggled successfully on server:", effectiveListId, newPrivacy); setError(null); setPendingActions(prev => offlineService.storePendingActions(prev.filter(a => a.id !== syncAction.id))); offlineService.storeLists(newListsState); } }); } else { const updatedQueue = offlineService.addPendingAction(syncAction); setPendingActions(updatedQueue); setError(null); console.log("Offline: Toggle privacy action queued."); offlineService.storeLists(newListsState); } }, [lists, currentUser, socket, t, setError, setLists, setPendingActions]);
    const handleUpdateItemComment = useCallback((itemId, comment) => { const listId = currentListIdRef.current; if (!listId || !itemId) return; const safeLists = lists || []; const list = safeLists.find(l => l._id === listId || l.tempId === listId); if (!list) return; const item = (list.items || []).find(i => i._id === itemId || i.tempId === itemId); if (!item) return; const effectiveItemId = item._id || item.tempId; queueItemAction({ type: 'updateItemComment', payload: { listId, itemId: effectiveItemId, comment } }); }, [queueItemAction]);


    // --- Sync Logic ---
    const handleSyncConfirm = useCallback(async () => { const currentPending = offlineService.getPendingActions(); if (!socket.connected || currentPending.length === 0) { setShowSyncPrompt(false); if (!socket.connected && currentPending.length > 0) setError(t('sync_failed_disconnected')); return; } console.log(`Starting sync of ${currentPending.length} actions...`); setShowSyncPrompt(false); setIsSyncing(true); setError(t('syncing_changes')); let syncErrorOccurred = false; const successfulActionIds = new Set(); const actionsToSync = [...currentPending]; try { for (const action of actionsToSync) { await new Promise(resolve => setTimeout(resolve, 150)); if (!socket.connected) { syncErrorOccurred = true; setError(t('connection_lost_error')); break; } console.log(`Syncing action ID: ${action.id}, Type: ${action.type}`); try { const response = await new Promise((resolvePrepare, rejectPrepare) => { let eventName = action.type; let emitPayload = { ...action.payload }; let requiresEmit = true; let tempIdMap = {}; const currentLocalLists = offlineService.getStoredLists(); let list, item; switch (eventName) { case 'addList': emitPayload = { name: action.payload.name, isPublic: action.payload.isPublic }; tempIdMap = { listTempId: action.payload.tempId }; break; case 'deleteList': list = currentLocalLists.find(l => l.tempId === action.payload.listId); if (list && !list._id) { console.log(`Sync: Skipping deleteList for offline-only list (tempId: ${action.payload.listId})`); requiresEmit = false; successfulActionIds.add(action.id); const addAction = actionsToSync.find(a => a.type === 'addList' && a.payload.tempId === action.payload.listId); if (addAction) successfulActionIds.add(addAction.id); resolvePrepare({ skipped: true }); return; } list = currentLocalLists.find(l => l._id === action.payload.listId || l.tempId === action.payload.listId); emitPayload = list?._id || action.payload.listId; break; case 'addItem': list = currentLocalLists.find(l => l._id === action.payload.listId || l.tempId === action.payload.listId); if (!list || !list._id) { requiresEmit = false; console.log(`Sync: Skipping addItem for list without server ID (${action.payload.listId})`); break; } emitPayload = { listId: list._id, itemName: action.payload.itemName }; tempIdMap = { itemTempId: action.payload.tempItemId, listId: list._id }; break; case 'deleteItem': case 'toggleItem': case 'updateItemComment': list = currentLocalLists.find(l => l._id === action.payload.listId || l.tempId === action.payload.listId); if (!list || !list._id) { requiresEmit = false; console.log(`Sync: Skipping ${eventName} for list without server ID (${action.payload.listId})`); break; } item = (list.items || []).find(i => i._id === action.payload.itemId || i.tempId === action.payload.itemId); if (!item || !item._id) { requiresEmit = false; console.log(`Sync: Skipping ${eventName} for item without server ID (${action.payload.itemId})`); break; } emitPayload = { ...action.payload, listId: list._id, itemId: item._id }; break; case 'toggleListPrivacy': list = currentLocalLists.find(l => l._id === action.payload.listId || l.tempId === action.payload.listId); if (!list || !list._id) { requiresEmit = false; console.log(`Sync: Skipping toggleListPrivacy for list without server ID (${action.payload.listId})`); break; } emitPayload = list._id; break; default: console.warn(`Unknown action type during sync: ${eventName}. Skipping.`); requiresEmit = false; break; } if (!requiresEmit) { resolvePrepare({ skipped: true }); return; } socket.emit(eventName, emitPayload, (res) => { if (!isMountedRef.current) return; if (res?.error) { console.error(`Server rejected action ${action.id} (${eventName}):`, res.error); rejectPrepare({ message: res.error, action }); } else { console.log(`Action ${action.id} (${eventName}) acknowledged by server.`); let listsAfterMapping = offlineService.getStoredLists(); let stateChanged = false; if (eventName === 'addList' && res?.newList?._id && tempIdMap.listTempId) { listsAfterMapping = listsAfterMapping.map(l => l.tempId === tempIdMap.listTempId ? { ...res.newList, isOffline: false, tempId: undefined } : l ); if (!listsAfterMapping.some(l => l._id === res.newList._id)) listsAfterMapping.push({...res.newList, isOffline: false, tempId: undefined}); stateChanged = true; if(currentListIdRef.current === tempIdMap.listTempId) setCurrentListId(res.newList._id); } else if (eventName === 'addItem' && res?.item?._id && tempIdMap.itemTempId) { const listIdx = listsAfterMapping.findIndex(l => l._id === tempIdMap.listId); if (listIdx !== -1) { let itemMapped = false; listsAfterMapping[listIdx].items = (listsAfterMapping[listIdx].items || []).map(i => { if (i.tempId === tempIdMap.itemTempId) { itemMapped = true; return { ...res.item, isOffline: false, tempId: undefined }; } return i; }); if (!itemMapped && !listsAfterMapping[listIdx].items.some(i => i._id === res.item._id)) { listsAfterMapping[listIdx].items.push({...res.item, isOffline: false, tempId: undefined}); } listsAfterMapping[listIdx].isOffline = false; stateChanged = true; } } if (stateChanged) { offlineService.storeLists(listsAfterMapping); setLists(listsAfterMapping); } resolvePrepare({ success: true }); } }); setTimeout(() => rejectPrepare({ message: 'Sync emit timeout', action }), 15000); }); if (response?.success || response?.skipped) { if(!response.skipped) successfulActionIds.add(action.id); } } catch (err) { console.error(`Sync error for action ${err.action?.id} (${err.action?.type || 'Unknown'}):`, err.message); syncErrorOccurred = true; if (isMountedRef.current) setError(t('sync_failed_action', { actionType: err.action?.type || 'Unknown', message: err.message })); break; } } } catch (outerError) { console.error("Critical error during sync process:", outerError); syncErrorOccurred = true; if (isMountedRef.current) setError(t('sync_failed') + ' (Critical Process Error)'); } finally { if (isMountedRef.current) { const finalPendingActions = (pendingActions || []).filter(action => !successfulActionIds.has(action.id)); offlineService.storePendingActions(finalPendingActions); setPendingActions(finalPendingActions); console.log(`Sync finished. Successful: ${successfulActionIds.size}, Remaining: ${finalPendingActions.length}`); console.log("Fetching latest state post-sync."); try { if (socket.connected && currentUser && !isAuthLoading) { await fetchLists(true); console.log("Latest state fetched after sync."); const latestPending = offlineService.getPendingActions(); setPendingActions(latestPending); if (!syncErrorOccurred && latestPending.length === 0) { setError(t('sync_complete')); setTimeout(() => { if (isMountedRef.current) setError(null); }, 3000); } else if (!syncErrorOccurred && latestPending.length > 0) { setError(t('sync_partially_complete')); } } else { console.log("Skipping post-sync fetch: Not connected or auth issue."); if (syncErrorOccurred && !error) setError(t('sync_failed')); } } catch (fetchError) { console.error("Error fetching lists after sync:", fetchError); setError(currentError => currentError || t('sync_fetch_failed')); } finally { setIsSyncing(false); console.log("Sync process cleanup complete."); if(offlineService.getPendingActions().length > 0 && socket.connected) { setTimeout(() => { if (isMountedRef.current) setShowSyncPrompt(true); }, 1000); } } } } }, [socket, pendingActions, t, handleLogout, fetchLists, currentUser, isAuthLoading, setError, setIsSyncing, setShowSyncPrompt, setLists, setPendingActions, setCurrentListId]);


    const handleSyncCancel = useCallback(() => { setShowSyncPrompt(false); if (!socket.connected && (pendingActions || []).length > 0) { setError(t('sync_cancelled_offline_warning')); } else { setError(null); } }, [socket, pendingActions, t, setError, setShowSyncPrompt]);


    // --- Admin Handlers ---
    const handleOpenAdminPinModal = useCallback(() => { setAdminPinError(null); setIsAdminPinModalOpen(true); }, []);
    const handleVerifyAdminPin = useCallback(async (pin) => { if(!API_URL) { setAdminPinError("API URL not configured."); return; } setIsLoading(true); setAdminPinError(null); try { const res = await fetch(`${API_URL}/api/admin/verify-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }), credentials: 'include' }); const data = await res.json(); if (!res.ok) throw new Error(data.message || `Admin verification failed`); if (isMountedRef.current) { setIsAdminVerified(true); setIsAdminPinModalOpen(false); setCurrentView('admin'); setError(null); setAuthError(null); } } catch (err) { if (isMountedRef.current) setAdminPinError(err.message || 'Admin verification failed'); } finally { if (isMountedRef.current) setIsLoading(false); } }, [API_URL, setIsLoading, setAdminPinError, setIsAdminVerified, setIsAdminPinModalOpen, setCurrentView, setError, setAuthError]);
    const handleExitAdminMode = useCallback(() => { setIsAdminVerified(false); setCurrentView('lists'); }, [setIsAdminVerified, setCurrentView]);
    const handleNavigateToLogs = useCallback(() => { if (isAdminVerified) setCurrentView('adminLogs'); else handleOpenAdminPinModal(); }, [isAdminVerified, handleOpenAdminPinModal, setCurrentView]);


    // Derived State
    const currentList = useMemo(() => { if (!currentUser || currentView !== 'detail' || !currentListId || !Array.isArray(lists)) return null; return lists.find(list => list._id === currentListId || list.tempId === currentListId); }, [currentUser, currentView, currentListId, lists]);
    const currentListItems = useMemo(() => currentList?.items || [], [currentList]);
    const showLoadingOverlay = isAuthLoading || isSyncing || (isLoading && (!currentList && currentView === 'detail'));


    // --- Render Logic ---
    const renderContent = () => {
        if (isAuthLoading) return null;
        if (!currentUser) { if (currentView !== 'login') { console.warn("No user, forcing login view."); setCurrentView('login'); return null; } return <Login onLogin={handleLogin} error={authError} setError={setAuthError} />; }
        switch (currentView) {
            case 'login': console.warn("User exists, but view is login. Rendering lists."); return <ShoppingLists lists={lists} onSelectList={handleSelectList} onAddList={handleAddList} />;
            case 'lists': return <ShoppingLists lists={lists} onSelectList={handleSelectList} onAddList={handleAddList} />;
            case 'detail': if (isLoading && !currentList) { return <div className="text-center p-10"><div className="flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary"></div><span className="ml-3 text-gray-500 dark:text-gray-400">{t('loading')}</span></div></div>; } if (!currentList) { return <div className="text-center p-10"><p className="text-red-500 mb-4">{t('list_not_found_or_access_denied')}</p><button onClick={handleBackToLists} className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white">{t('back_to_lists')}</button></div>; } return <ShoppingListDetail key={currentList._id || currentList.tempId} list={currentList} items={currentListItems} currentUser={currentUser} isOnline={isOnline} queueItemAction={queueItemAction} onBack={handleBackToLists} onDeleteList={handleDeleteList} onError={setError} onTogglePrivacy={handleTogglePrivacy} onUpdateComment={handleUpdateItemComment} />;
            case 'admin': if (!isAdminVerified) return <div className="text-center p-10"><p className="text-red-500">{t('admin_access_required')}</p><button onClick={handleExitAdminMode} className="mt-4 px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white">{t('back_to_app')}</button></div>; return <AdminPanel onExitAdminMode={handleExitAdminMode} onNavigateToLogs={handleNavigateToLogs} currentUser={currentUser} />;
            case 'adminLogs': if (!isAdminVerified) return <div className="text-center p-10"><p className="text-red-500">{t('admin_access_required')}</p><button onClick={handleExitAdminMode} className="mt-4 px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white">{t('back_to_app')}</button></div>; return <LogViewer onExit={handleExitAdminMode} currentUser={currentUser} />;
            default: console.warn(`Invalid view state: ${currentView}. Rendering lists view.`); return <ShoppingLists lists={lists} onSelectList={handleSelectList} onAddList={handleAddList} />;
        }
    };

    return (
        <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">
            {showLoadingOverlay && <LoadingOverlay />}
            {!isAuthLoading && currentUser && currentView !== 'login' && (
                 <div className="fixed top-0 left-0 right-0 z-20 flex justify-between items-center gap-3 p-4 bg-background/80 dark:bg-dark-background/80 backdrop-blur-sm border-b border-secondary dark:border-dark-secondary">
                    <div className="flex-1"> {(currentView === 'detail' || currentView === 'admin' || currentView === 'adminLogs') && ( <button onClick={currentView === 'detail' ? handleBackToLists : handleExitAdminMode} className="text-primary dark:text-dark-primary hover:underline flex items-center gap-1 text-sm sm:text-base flex-shrink-0"> <span className="material-symbols-rounded text-lg leading-none">arrow_back</span> {currentView === 'detail' ? t('back_to_lists') : t('back_to_app')} </button> )} </div>
                    <div className="flex-1 text-center"> {currentView === 'lists' && <span className="text-xl font-semibold text-primary dark:text-dark-primary hidden sm:inline">{t('app_title')}</span>} {currentView === 'detail' && <span className="text-xl font-semibold text-primary dark:text-dark-primary truncate">{currentList?.name || t('list_detail_title')}</span>} {currentView === 'admin' && <span className="text-xl font-semibold text-primary dark:text-dark-primary">{t('admin_panel_title')}</span>} {currentView === 'adminLogs' && <span className="text-xl font-semibold text-primary dark:text-dark-primary">{t('log_viewer_title')}</span>} </div>
                     <div className="flex flex-1 justify-end items-center gap-2 sm:gap-3"> {!isConnected && isSocketAttempted && ( <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-100 dark:bg-amber-800/50 text-amber-800 dark:text-amber-100 shadow-sm border border-amber-300 dark:border-amber-700/50 animate-pulse" title={t('offline_mode_active')} > <span className="material-symbols-rounded text-sm leading-none">cloud_off</span> <span>{t('status_offline', 'Offline')}</span> </div> )} {currentUser?.isAdmin && currentView !== 'admin' && currentView !== 'adminLogs' && ( <button onClick={handleOpenAdminPinModal} title={t('admin_button_title')} className="p-1.5 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary dark:focus:ring-dark-primary focus:ring-offset-background dark:focus:ring-offset-dark-background"> <span className="material-symbols-rounded text-lg leading-none">admin_panel_settings</span> </button> )} <button onClick={() => handleLogout()} title={t('logout_button_title')} className="p-1.5 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary dark:focus:ring-dark-primary focus:ring-offset-background dark:focus:ring-offset-dark-background"> <span className="material-symbols-rounded text-lg leading-none">logout</span> </button> <LanguageToggle currentLang={currentLanguage} onChangeLang={changeLanguage} /> <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} /> </div>
                 </div>
            )}
             <main className={`max-w-4xl mx-auto p-4 ${currentUser && currentView !== 'login' ? 'pt-20' : ''}`}>
                 {!isAuthLoading && currentUser && currentView !== 'login' && ( <div className="text-center mb-4 text-xs min-h-[1.2em]"> {error ? ( <span className="text-red-600 dark:text-red-400 font-semibold">{error}</span> ) : authError && currentView !== 'login' ? ( <span className="text-red-600 dark:text-red-400 font-semibold">{authError}</span> ) : !isLoading && !isSyncing && isConnected ? ( <span className={`transition-opacity duration-300 text-green-600 dark:text-green-400`}>{t('status_connected')}</span> ) : null } </div> )}
                {renderContent()}
            </main>
            <AdminPinModal isOpen={isAdminPinModalOpen} onClose={() => setIsAdminPinModalOpen(false)} onVerify={handleVerifyAdminPin} error={adminPinError} setError={setAdminPinError}/>
            <SyncPromptModal isOpen={showSyncPrompt} onClose={handleSyncCancel} onConfirmSync={handleSyncConfirm} pendingActionCount={Array.isArray(pendingActions) ? pendingActions.length : 0} />
        </div>
    );
}

export default App;