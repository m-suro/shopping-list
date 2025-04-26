// client/src/components/ShoppingLists.jsx
import React, { useState, useMemo } from 'react'; // Removed unused useCallback
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';

// Import the modal component which is now in its own file
import AddListModal from './modals/AddListModal';

// --- Shopping Lists Component ---
// This component displays the list of shopping lists and the add list button/modal.
function ShoppingLists({ lists, onSelectList, onAddList, currentUser }) {
    const { t } = useTranslation();
    const [listAnimationParent] = useAutoAnimate();
    const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);

    const handleOpenModal = () => setIsAddListModalOpen(true);
    const handleCloseModal = () => setIsAddListModalOpen(false);

    // This handler passes the list name and privacy from the modal up to the parent (App)
    const handleAddListAndCloseModal = (name, isPublic) => {
        onAddList(name, isPublic); // Call the prop function provided by App
        handleCloseModal();
    };

    // Memoize sorting the lists to avoid re-sorting on every render if lists array reference doesn't change
    const sortedLists = useMemo(() => Array.isArray(lists) ? [...lists].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [], [lists]);

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <h1 className="text-3xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('app_title')}</h1>

            {/* Display Logged-in User */}
            {currentUser?.username && (
                 <p className="text-center text-sm text-gray-600 dark:text-gray-300 mb-4">
                     {t('logged_in_as', { username: currentUser.username })}
                 </p>
             )}

            {/* Conditional rendering based on whether there are lists */}
            {(lists || []).length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">{t('no_lists_message')}</p>
            ) : (
                // List of shopping lists
                <ul ref={listAnimationParent} className="space-y-2 list-none p-0 mb-6">
                    {sortedLists.map(list => (
                        <li
                            key={list._id || list.tempId} // Use effective ID for key
                            className="flex justify-between items-center p-3 bg-secondary/30 dark:bg-dark-secondary/30 rounded cursor-pointer hover:bg-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors"
                            onClick={() => onSelectList(list._id || list.tempId)} // Call the prop function to select the list
                            role="button" // Make list item semantically clickable
                            tabIndex={0} // Make list item focusable
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectList(list._id || list.tempId)} // Handle keyboard navigation
                        >
                            <div className="flex items-center gap-2 min-w-0 mr-2">
                                {/* Privacy icon */}
                                <span title={list.isPublic ? t('list_status_public') : t('list_status_private')} className={`material-symbols-rounded text-base ${list.isPublic ? 'text-blue-500' : 'text-yellow-600'}`} aria-hidden="true">{list.isPublic ? 'public' : 'lock'}</span>
                                {/* List name - truncate long names */}
                                <span className="font-medium text-text dark:text-dark-text break-words truncate">{list.name}</span>
                                {/* Offline status indicator for offline-only lists */}
                                {(list.tempId && !list._id) && ( <span className="material-symbols-rounded text-xs text-amber-500 ml-1 flex-shrink-0" title={t('offline_only_list_tooltip')}>cloud_off</span> )}
                                {/* Display owner username if available */}
                                {list?.owner?.username && <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">({list.owner.username})</span>}
                            </div>
                            {/* Right arrow icon */}
                            <span className="material-symbols-rounded text-primary dark:text-dark-primary flex-shrink-0" aria-hidden="true">chevron_right</span>
                        </li>
                    ))}
                </ul>
            )}

            {/* Create List Button */}
            <div className="mt-6 pt-4 border-t border-secondary dark:border-dark-secondary flex justify-center">
                <button type="button" onClick={handleOpenModal} className="w-full sm:w-auto px-5 py-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                    <span className="material-symbols-rounded">add</span>{t('create_list_button')}
                </button>
            </div>

            {/* Add List Modal - Rendered but controlled by state */}
            <AddListModal
                isOpen={isAddListModalOpen}
                onClose={handleCloseModal}
                onAddList={handleAddListAndCloseModal}
            />
        </div>
    );
}

export default ShoppingLists;