// client/src/ShareListModal.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react';

function ShareListModal({ isOpen, onClose, listId, listName, onError }) {
    const { t } = useTranslation();
    const [usernameToInvite, setUsernameToInvite] = useState('');
    const [inviteSuggestions, setInviteSuggestions] = useState([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [modalError, setModalError] = useState(null);

    const inviteInputRef = useRef(null);
    const suggestionsRef = useRef(null);
    // Use the ref returned by useAutoAnimate directly
    const [modalContentRef] = useAutoAnimate(); // Use the auto-animate ref here

    const API_URL = import.meta.env.VITE_SERVER_URL;

    // --- Reset state when modal opens/closes ---
    useEffect(() => {
        if (isOpen) {
            setUsernameToInvite('');
            setInviteSuggestions([]);
            setShowSuggestions(false);
            setIsSearchingUsers(false);
            setIsInviting(false);
            setModalError(null);
            setTimeout(() => inviteInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // --- Debounced User Search ---
    useEffect(() => {
        if (!isOpen || !usernameToInvite || usernameToInvite.length < 2) {
            setInviteSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        setIsSearchingUsers(true);
        setModalError(null);
        const debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(usernameToInvite)}`, { credentials: 'include' });
                if (!response.ok) throw new Error(t('error_searching_users'));
                const users = await response.json();
                setInviteSuggestions(users);
                // Show suggestions only if there are users found, even if still searching initially
                setShowSuggestions(users.length > 0);
            } catch (err) {
                console.error("User search error:", err);
                setInviteSuggestions([]);
                setShowSuggestions(false);
                setModalError(err.message || t('error_searching_users'));
            } finally {
                setIsSearchingUsers(false);
            }
        }, 350);
        return () => clearTimeout(debounceTimer);
    }, [usernameToInvite, API_URL, isOpen, t]); // Added t dependency

    // --- Invite User Submission ---
    const handleInviteUser = useCallback((e) => {
        e.preventDefault();
        const username = usernameToInvite.trim();
        if (!listId || !username) return;
        setIsInviting(true); setShowSuggestions(false); setInviteSuggestions([]); setModalError(null);
        socket.emit('inviteUserToList', { listId, usernameToInvite: username }, (response) => {
            setIsInviting(false);
            if (response?.error) {
                const errorCode = response.code || 'generic';
                const errorMessage = t(`error_invite_user_${errorCode}`, { username: username, message: response.error });
                setModalError(errorMessage);
                onError(errorMessage);
            } else {
                setUsernameToInvite('');
                onError(null);
                // onClose(); // Optionally close on success
            }
        });
    }, [listId, usernameToInvite, onError, t, onClose]);

    // --- Handle Suggestion Selection ---
    const handleSelectSuggestion = (username) => {
        setUsernameToInvite(username); setShowSuggestions(false); setInviteSuggestions([]); inviteInputRef.current?.focus();
    };

    // --- Handle Clicking Outside Suggestions/Modal ---
     useEffect(() => {
         const handleClickOutside = (event) => {
             if ( showSuggestions && inviteInputRef.current && !inviteInputRef.current.contains(event.target) && suggestionsRef.current && !suggestionsRef.current.contains(event.target) ) {
                 setShowSuggestions(false);
             }
         };
         if (isOpen) document.addEventListener('mousedown', handleClickOutside);
         return () => document.removeEventListener('mousedown', handleClickOutside);
     }, [isOpen, showSuggestions]);

     // --- Handle Escape Key ---
    useEffect(() => {
        const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="share-list-modal-title">
            <div
                ref={modalContentRef} // Attach the ref from useAutoAnimate directly
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter relative"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="share-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">
                     {t('share_list_title', 'Share List: {{listName}}', { listName })}
                </h2>

                {modalError && (
                    <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm">
                        {modalError}
                    </p>
                 )}

                <form onSubmit={handleInviteUser} className="flex items-center gap-2">
                     <input
                         ref={inviteInputRef}
                         type="text"
                         value={usernameToInvite}
                         onChange={(e) => setUsernameToInvite(e.target.value.toLowerCase())}
                         onFocus={() => setShowSuggestions(inviteSuggestions.length > 0 && usernameToInvite.length >= 2)}
                         placeholder={t('invite_username_placeholder')}
                         className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary/50 dark:border-dark-primary/50 focus:ring-accent dark:focus:ring-dark-accent text-sm h-9"
                         aria-label={t('invite_username_placeholder')}
                         required
                         autoCapitalize="none"
                         autoComplete="off"
                         aria-autocomplete="list"
                         aria-controls="invite-suggestions-modal"
                         aria-expanded={showSuggestions}
                     />
                     <button type="submit" disabled={isInviting || !usernameToInvite} className="px-3 py-1 rounded bg-accent dark:bg-dark-accent text-white text-xs hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center min-w-[70px] h-9">
                         {isInviting ? (<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>) : (<>{t('invite_button')}</>)}
                     </button>
                </form>

                {/* Suggestions Dropdown within Modal */}
                {/* Conditionally render based on showSuggestions state */}
                {showSuggestions && (
                     <ul
                         id="invite-suggestions-modal"
                         ref={suggestionsRef} // Ref for click outside check
                         className="absolute left-6 right-6 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20"
                         role="listbox"
                     >
                         {isSearchingUsers ? (<li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 italic">{t('searching_users')}</li>)
                         : inviteSuggestions.length > 0 ? (inviteSuggestions.map(user => (<li key={user._id} onClick={() => handleSelectSuggestion(user.username)} onMouseDown={(e) => e.preventDefault()} className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" role="option" aria-selected="false">{user.username}</li>)))
                         : usernameToInvite.length >= 2 ? (<li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 italic">{t('no_users_found')}</li>) // Show 'no users' only if searched
                         : null // Don't show anything if input is too short
                        }
                     </ul>
                )}

                {/* Close Button */}
                 <div className="mt-6 flex justify-end">
                     <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity text-sm">
                         {t('close_button', 'Close')}
                     </button>
                 </div>
            </div>
        </div>
    );
}

export default ShareListModal;