// client/src/ShareListModal.jsx
// Description: Modal component for sharing a shopping list.
// Fetches all users and allows the list owner to select/deselect users for sharing.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoAnimate } from '@formkit/auto-animate/react';

function ShareListModal({ isOpen, onClose, list, currentUser, isOnline, onUpdateAllowedUsers, onError }) {
    const { t } = useTranslation();
    const [allUsers, setAllUsers] = useState([]);
    // Use a Set for efficient checking/toggling of selected user IDs
    const [selectedUsers, setSelectedUsers] = useState(new Set());
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalError, setModalError] = useState(null);

    const [modalContentRef] = useAutoAnimate(); // Ref for auto-animate

    const API_URL = import.meta.env.VITE_SERVER_URL;

    // --- Effect to fetch all users when modal opens ---
    useEffect(() => {
        // Fetch users only if modal is open, online, and we don't have users yet or list ID changes
        if (isOpen && isOnline && API_URL && (allUsers.length === 0 || list?._id)) {
            const fetchUsers = async () => {
                setIsLoadingUsers(true);
                setModalError(null);
                try {
                    // Fetch ALL users (excluding current user is handled server-side)
                    const response = await fetch(`${API_URL}/api/users`, { credentials: 'include' });
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.message || t('error_fetching_users'));
                    }
                    const users = await response.json();
                    setAllUsers(users);
                } catch (err) {
                    console.error("Error fetching users for sharing:", err);
                    setModalError(err.message || t('error_fetching_users_generic'));
                    // Also notify the main app error handler
                    onError(err.message || t('error_fetching_users_generic'));
                } finally {
                    setIsLoadingUsers(false);
                }
            };
            fetchUsers();
        }
    }, [isOpen, isOnline, API_URL, t, onError, list?._id]); // Refetch users if list ID changes (though modal closes/opens) or online status changes while open

    // --- Effect to initialize selected users when modal opens or list changes ---
    useEffect(() => {
        if (isOpen && list) {
            // Initialize selectedUsers with the list's current allowed users
             // Ensure list.allowedUsers is an array and map to a Set of strings
            const initialSelected = new Set((Array.isArray(list.allowedUsers) ? list.allowedUsers : []).map(user => user._id));
            setSelectedUsers(initialSelected);
            setModalError(null); // Clear modal error on open
        }
    }, [isOpen, list]); // Re-initialize if modal opens or the 'list' prop changes

    // --- Handle User Selection/Deselection ---
    const handleUserSelect = useCallback((userId) => {
        setSelectedUsers(prevSelected => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(userId)) {
                newSelected.delete(userId);
            } else {
                newSelected.add(userId);
            }
            return newSelected;
        });
    }, []);

    // --- Handle Save Button Click ---
    const handleSave = useCallback(async (e) => {
        e.preventDefault();
        if (!list?._id || !currentUser?.isAdmin && !list?.owner?._id.equals(currentUser?._id)) {
            // Should ideally not happen if button is disabled correctly, but defensive check
            setModalError(t('permission_denied'));
            return;
        }
        if (!isOnline || isSaving) {
             // Button should be disabled, but defensive check
             setModalError(t('offline_mode_active')); // Or different message if already saving
             return;
        }

        setIsSaving(true);
        setModalError(null);

        // Convert the Set of selected user IDs to an array of strings
        const newAllowedUserIds = Array.from(selectedUsers);

        // Call the onUpdateAllowedUsers handler passed from App.jsx
        // App.jsx will handle the actual socket emission/offline queueing and error propagation.
        // We don't need to await here or handle socket response directly in the modal.
        // App.jsx will handle the state update and potentially close the modal via onClose prop
        // or set a global error. The handler should ideally return a promise or accept a callback
        // to indicate completion/error, but for simplicity, we rely on App.jsx's state management.
        if (typeof onUpdateAllowedUsers === 'function') {
             // Call the handler. It will handle saving, state updates, and error setting in App.
            onUpdateAllowedUsers(list._id, newAllowedUserIds);
             // The modal will be closed by App.jsx calling onClose after the action is processed (or queued offline).
        } else {
             console.error("onUpdateAllowedUsers prop is not a function!");
             setModalError(t('save_handler_missing'));
             setIsSaving(false); // Ensure saving state is reset if handler is missing
        }

        // Modal closing logic is now in App.jsx's onUpdateAllowedUsers callback
        // onClose(); // <-- Removed this line to let App control closing

    }, [list, selectedUsers, onUpdateAllowedUsers, t, isOnline, isSaving, currentUser]); // Added currentUser, isOnline, isSaving

    // --- Handle Escape Key ---
    useEffect(() => {
        const handleKeyDown = (event) => { if (event.key === 'Escape' && !isSaving) onClose(); }; // Allow escape unless saving
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, isSaving]); // Added isSaving to dependency


    // --- Prevent body scroll when modal is open ---
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);


    if (!isOpen || !list || !currentUser) return null; // Don't render if not open, no list, or no user

    // Check if the current user is the owner of the list being shared
    const isListOwner = list?.owner?._id === currentUser?._id;
     // Check if the current user is in the list of allowed users (should only be true if not owner)
     const isCurrentUserAllowed = list?.allowedUsers?.some(user => user._id === currentUser._id);

    // Ensure the list is private before rendering the share options (sharing is only for private lists)
     if (list.isPublic) {
         console.warn("Attempted to open ShareListModal for a public list.");
          // Could optionally show a different message or just close
          // onClose(); // Or handle this case in App.jsx before opening
         // For now, return null and rely on App.jsx's check before opening
         return null;
     }


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out" onClick={isSaving ? null : onClose} role="dialog" aria-modal="true" aria-labelledby="share-list-modal-title">
            <div
                ref={modalContentRef} // Attach the ref from useAutoAnimate directly
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter relative flex flex-col max-h-[90vh]" // Added flex/max-h for scrolling content
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="share-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary flex-shrink-0">
                     {t('share_list_title', 'Share List: {{listName}}', { listName: list.name })}
                </h2>

                {modalError && (
                    <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm flex-shrink-0">
                        {modalError}
                    </p>
                 )}
                 {isSaving && (
                      <p className="mb-4 text-center text-blue-600 dark:text-blue-400 italic flex-shrink-0">
                          {t('saving_changes')}
                      </p>
                 )}


                {isLoadingUsers ? (
                     <div className="flex-grow flex flex-col items-center justify-center p-6">
                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary mb-3"></div>
                         <span className="text-gray-500 dark:text-gray-400">{t('loading_users')}</span>
                     </div>
                ) : allUsers.length === 0 ? (
                     <div className="flex-grow flex flex-col items-center justify-center p-6">
                         <p className="text-gray-500 dark:text-gray-400 italic text-center">{t('no_other_users_available')}</p>
                         <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">{t('admin_can_add_users_note')}</p>
                     </div>
                ) : (
                    <div className="flex-grow overflow-y-auto mb-4 pr-2 -mr-2"> {/* Added overflow and padding for scrollbar */}
                         <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('select_users_to_share_with')}:</p>
                         <ul className="space-y-2">
                             {/* Display owner first if they are not the current user */}
                             {list.owner && list.owner._id !== currentUser._id && (
                                  <li className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-md opacity-70 cursor-not-allowed">
                                      <input
                                           type="checkbox"
                                           id={`user-${list.owner._id}`}
                                          checked // Owner always has access
                                          disabled // Cannot remove owner
                                          className="form-checkbox h-4 w-4 text-gray-500 dark:text-gray-400 rounded"
                                      />
                                       <label htmlFor={`user-${list.owner._id}`} className="text-gray-700 dark:text-gray-300 text-sm flex-grow">
                                           {list.owner.username} ({t('list_owner_label')})
                                      </label>
                                  </li>
                             )}
                              {/* Display current user if they are not the owner */}
                              {!isListOwner && currentUser && (
                                  <li className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-md opacity-70 cursor-not-allowed">
                                      <input
                                           type="checkbox"
                                           id={`user-${currentUser._id}`}
                                          checked={isCurrentUserAllowed} // Current user's access
                                          disabled // Cannot change current user's access via THIS modal
                                          className="form-checkbox h-4 w-4 text-gray-500 dark:text-gray-400 rounded"
                                      />
                                       <label htmlFor={`user-${currentUser._id}`} className="text-gray-700 dark:text-gray-300 text-sm flex-grow">
                                           {currentUser.username} ({t('you_label')})
                                      </label>
                                  </li>
                             )}

                             {/* Display all other users with checkboxes */}
                             {allUsers
                                .filter(user => user._id !== currentUser._id) // Exclude current user again just in case API didn't
                                .map(user => (
                                 <li key={user._id} className="flex items-center gap-3 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-md cursor-pointer transition-colors">
                                     <input
                                         type="checkbox"
                                         id={`user-${user._id}`}
                                         checked={selectedUsers.has(user._id)} // Check if this user is currently selected
                                         onChange={() => handleUserSelect(user._id)} // Call handler on change
                                         className="form-checkbox h-4 w-4 text-primary dark:text-dark-primary rounded focus:ring-accent dark:focus:ring-dark-accent cursor-pointer"
                                     />
                                     <label htmlFor={`user-${user._id}`} className="text-text dark:text-dark-text text-sm flex-grow cursor-pointer">
                                         {user.username}
                                     </label>
                                 </li>
                            ))}
                         </ul>
                    </div>
                )}


                {/* Action Buttons (Save/Cancel) */}
                 <div className="flex justify-end gap-3 flex-shrink-0 mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={isSaving ? null : onClose} disabled={isSaving} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                         {t('cancel_button')}
                    </button>
                    <button
                        type="button" // Use type="button" as it's not within a form
                        onClick={handleSave}
                        disabled={isSaving || isLoadingUsers || !isOnline} // Disable while saving, loading users, or offline
                        className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                         {isSaving ? (<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>) : (<>{t('save_button')}</>)}
                    </button>
                 </div>
            </div>
        </div>
    );
}

export default ShareListModal;