// client/src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';

// --- Custom useSwipe Hook ---
const useSwipe = (elementRef, { onSwipeRight, threshold = 50 }) => {
    const touchStartX = useRef(null);
    const touchCurrentX = useRef(null);
    const isSwiping = useRef(false);
    const touchStartY = useRef(null); // To differentiate scroll vs swipe

    // --- Touch Event Handlers ---
    const handleTouchStart = useCallback((e) => {
        if (e.touches.length === 1) { // Only handle single touch swipes
            touchStartX.current = e.touches[0].clientX;
            touchCurrentX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY; // Record Y start
            isSwiping.current = false; // Reset swipe status
             // Reset visual offset if the hook provides it directly
             if (elementRef.current) {
                 elementRef.current.style.transition = 'none'; // Disable transition during swipe
                 // Ensure progress starts at 0 visually on new touch
                 elementRef.current.style.setProperty('--swipe-progress', '0');
             }
        }
    }, [elementRef]);

    const handleTouchMove = useCallback((e) => {
        if (touchStartX.current === null || e.touches.length > 1) {
            return; // Not started or multi-touch
        }

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - touchStartX.current;
        const deltaY = currentY - (touchStartY.current ?? currentY); // Use Y start

        touchCurrentX.current = currentX; // Update current position regardless

        // Determine if it's primarily a horizontal swipe early on
        if (!isSwiping.current && Math.abs(deltaX) > 10) { // Initial horizontal movement threshold
            // If horizontal movement is significantly greater than vertical, treat as swipe
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) { // More horizontal than vertical
                isSwiping.current = true;
                 // Prevent vertical scroll ONLY when a horizontal swipe is confirmed
                 // This prevents hijacking scroll immediately on touch
                 if (e.cancelable) e.preventDefault();
            } else {
                // If more vertical, likely a scroll, abort swipe detection for this touch
                touchStartX.current = null;
                touchStartY.current = null;
                return;
            }
        }

         // Only apply visual effect and prevent scroll if actively swiping horizontally
         if (isSwiping.current) {
             if (e.cancelable) e.preventDefault(); // Continue preventing scroll

             // Apply visual transform (only allow right swipe for now)
             const offset = Math.max(0, deltaX); // Only positive offset for right swipe
             if (elementRef.current) {
                 elementRef.current.style.transform = `translateX(${offset * 0.6}px)`; // Dampen the movement slightly
                 // Calculate progress, ensure it doesn't exceed 1 easily
                 const progress = Math.min(1, Math.max(0, offset / (threshold * 1.5)));
                 elementRef.current.style.setProperty('--swipe-progress', `${progress}`); // CSS variable for icon opacity
             }
         }

    }, [elementRef, threshold]); // Include threshold dependency

    const handleTouchEnd = useCallback(() => {
        if (touchStartX.current === null || touchCurrentX.current === null) {
            return; // Swipe wasn't started properly or was aborted
        }

        const deltaX = touchCurrentX.current - touchStartX.current;
        const isValidSwipe = isSwiping.current && deltaX > threshold;

         // Reset visual state with transition
         if (elementRef.current) {
             elementRef.current.style.transition = 'transform 0.2s ease-out'; // Only transition transform back
             elementRef.current.style.transform = 'translateX(0px)';
             // Setting progress back to 0 immediately hides the background again.
              requestAnimationFrame(() => { // Ensure transform reset happens before resetting progress potentially
                  if (elementRef.current) {
                      elementRef.current.style.setProperty('--swipe-progress', '0');
                  }
              });
         }

        if (isValidSwipe) {
            console.log("Swipe right detected");
            onSwipeRight?.(); // Call the callback if threshold met
        } else {
             console.log("Swipe ended, threshold not met or wrong direction", deltaX);
        }

        // Reset refs after handling
        touchStartX.current = null;
        touchCurrentX.current = null;
        isSwiping.current = false;
        touchStartY.current = null;

    }, [onSwipeRight, threshold, elementRef]); // Include dependencies

    // --- Effect to Attach/Detach Listeners ---
    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        // Add touch event listeners
        element.addEventListener('touchstart', handleTouchStart, { passive: true }); // passive: true for start to allow default scroll initially
        element.addEventListener('touchmove', handleTouchMove, { passive: false }); // passive: false for move to allow preventDefault
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
        element.addEventListener('touchcancel', handleTouchEnd, { passive: true }); // Handle cancellation same as end

        // Cleanup
        return () => {
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            element.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]); // Re-attach if handlers change

    // No return value needed unless providing swipe state outward
};


// --- Segmented Control Component (No changes) ---
function SegmentedControl({ options, currentValue, onChange, ariaLabel }) {
    return (
        <div className="inline-flex rounded-lg shadow-sm bg-gray-200 dark:bg-gray-700 p-0.5" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out focus:z-10 focus:ring-2 focus:ring-offset-1 focus:ring-accent dark:focus:ring-dark-accent focus:ring-offset-gray-200 dark:focus:ring-offset-gray-700 outline-none flex items-center justify-center h-8 w-10`}
                    aria-pressed={currentValue === option.value}
                >
                    <span className={`transition-opacity duration-150 ${currentValue === option.value ? 'opacity-100' : 'opacity-75 hover:opacity-100'}`}>
                        {option.icon}
                    </span>
                </button>
            ))}
        </div>
    );
}

// --- ThemeToggle using Material Symbols Rounded (No changes) ---
function ThemeToggle({ isDarkMode, onToggle }) {
    const { t } = useTranslation();
    const themeOptions = [
        { value: 'light', icon: <span className="material-symbols-rounded text-lg leading-none">light_mode</span> },
        { value: 'dark', icon: <span className="material-symbols-rounded text-lg leading-none">dark_mode</span> }
    ];
    return (
        <SegmentedControl
            options={themeOptions}
            currentValue={isDarkMode ? 'dark' : 'light'}
            onChange={(value) => onToggle(value === 'dark')}
            ariaLabel={t('theme_toggle_aria_label', 'Theme Preference')}
        />
    );
}

// --- LanguageToggle using Image Flags (No changes) ---
function LanguageToggle({ currentLang, onChangeLang }) {
    const { t } = useTranslation();
    const languageOptions = [
        { value: 'en', icon: <img src="/USA.png" alt="USA Flag" className="w-5 h-auto" /> },
        { value: 'pl', icon: <img src="/Poland.png" alt="Poland Flag" className="w-5 h-auto" /> }
    ];
    return (
        <SegmentedControl
            options={languageOptions}
            currentValue={currentLang}
            onChange={onChangeLang}
            ariaLabel={t('language_toggle_aria_label', 'Language Preference')}
        />
    );
}

// --- AddItemInlineForm (No changes) ---
function AddItemInlineForm({ listId, onAddItem, onCancel }) {
    const { t } = useTranslation();
    const [itemName, setItemName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = () => {
        const trimmedName = itemName.trim();
        if (!trimmedName || !listId) return;
        onAddItem(listId, trimmedName);
        setItemName(''); // Clear input after submitting
        inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };

    return (
        <div className="flex gap-2 items-center flex-grow ml-1">
            <input
                ref={inputRef}
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('add_item_placeholder')}
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10"
                required
                aria-label={t('add_item_placeholder')}
            />
            <button
                type="button"
                onClick={handleSubmit}
                disabled={!itemName.trim()}
                className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-10"
            >
                {t('add_button')}
            </button>
        </div>
    );
}


// --- ShoppingListItem ---
// Includes swipe, touch-manipulation, and increased padding
function ShoppingListItem({ item, onToggle, onDelete }) {
    const { t } = useTranslation();
    const listItemRef = useRef(null); // Ref for the swipe target element

    // Setup swipe handler
    useSwipe(listItemRef, {
        onSwipeRight: () => onToggle(item._id), // Trigger toggle on right swipe
        threshold: 60, // Pixels to swipe before action triggers
    });

    return (
        // Outer li: Provides structure, base background, rounded corners, and overflow clipping
        <li className="relative my-1 rounded overflow-hidden bg-background dark:bg-dark-background group">
             {/* Swipe Action Background (Shows check or undo icon) */}
            <div
                 // Add opacity-0 initially, let the CSS var override during swipe
                className={`absolute inset-0 flex items-center justify-start pl-4 transition-opacity duration-100 ease-in opacity-0 ${item.completed ? 'bg-yellow-400/80 dark:bg-yellow-600/80' : 'bg-green-400/80 dark:bg-green-600/80'} opacity-[--swipe-progress]`}
                aria-hidden="true"
                style={{'--swipe-progress': 0}} // Ensure CSS var starts at 0
            >
                <span className={`material-symbols-rounded text-xl ${item.completed ? 'text-yellow-800 dark:text-yellow-200' : 'text-green-800 dark:text-green-200'}`}>
                    {item.completed ? 'undo' : 'check_circle'}
                </span>
            </div>

            {/* Inner div: Contains the actual content, handles swipe transform, and manages its own completed styling */}
            <div
                 ref={listItemRef} // Attach the ref to the div that will be moved
                 className={
                     // Increased padding for more height
                     `relative flex items-center justify-between py-4 px-2 rounded transition-all duration-300 ease-in-out z-10 group
                      ${item.completed
                        // Completed state styling: specific background and opacity
                        ? 'bg-green-100 dark:bg-green-900 opacity-70'
                        // Incomplete state styling: default background + hover effect
                        : 'bg-background dark:bg-dark-background hover:bg-gray-100 dark:hover:bg-gray-800'
                       }`
                 }
                 style={{ '--swipe-progress': 0 }} // Initialize CSS variable for swipe background opacity
             >
                {/* Label and Checkbox/Item Name */}
                {/* Added touch-manipulation class */}
                <label htmlFor={`item-${item._id}`} className="flex items-center gap-3 flex-grow cursor-pointer mr-2 min-w-0 touch-manipulation">
                    <input
                        id={`item-${item._id}`}
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => onToggle(item._id)}
                        className="absolute opacity-0 w-0 h-0 peer"
                        aria-hidden="true"
                    />
                    {/* Custom Checkbox visual */}
                    <span
                        className={`flex-shrink-0 w-5 h-5 border-2 rounded transition-colors duration-200 ease-in-out flex items-center justify-center
                                 ${item.completed
                                ? 'bg-primary dark:bg-dark-primary border-primary dark:border-dark-primary' // Checked style
                                : 'bg-white dark:bg-gray-700 border-primary/50 dark:border-dark-primary/50 peer-focus:ring-2 peer-focus:ring-offset-1 peer-focus:ring-offset-transparent peer-focus:ring-accent dark:peer-focus:ring-dark-accent' // Unchecked style
                                }`}
                        aria-hidden="true"
                    >
                        {item.completed && (
                            <svg className="w-3 h-3 text-white dark:text-dark-background" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </span>
                    {/* Item Name */}
                    <span className={`flex-grow transition-colors break-words ${item.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-text dark:text-dark-text'}`}>
                        {item.name}
                    </span>
                </label>

                {/* Delete Button */}
                <button
                    onClick={() => onDelete(item._id)}
                    // Make delete slightly less prominent until hover/focus on touch devices where swipe is primary
                    className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-lg font-bold flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity duration-150"
                    aria-label={t('delete_item_label', { itemName: item.name })}
                >
                    <span className="material-symbols-rounded text-xl leading-none align-middle">delete</span>
                </button>
            </div>
        </li>
    );
}


// --- ShoppingListDetail (No changes needed for auth phase 1) ---
function ShoppingListDetail({ list, items, onBack, onDeleteList }) {
    const { t } = useTranslation();
    const listId = list?._id;
    const [listAnimationParent] = useAutoAnimate();
    const [controlsAnimationParent] = useAutoAnimate();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeControl, setActiveControl] = useState('none');
    const searchInputRef = useRef(null);

    // Callbacks passed down for item actions
    const handleAddItem = useCallback((targetListId, itemName) => {
        socket.emit('addItem', { listId: targetListId, itemName }, (response) => {
            if (response?.error) alert(`Error: ${response.error}`);
        });
    }, []);

    const handleToggleItem = useCallback((itemId) => {
        if (!listId) return;
        socket.emit('toggleItem', { listId, itemId }, (response) => {
            if (response?.error) alert(`Error: ${response.error}`);
        });
    }, [listId]);

    const handleDeleteItem = useCallback((itemId) => {
        if (!listId) return;
        socket.emit('deleteItem', { listId, itemId }, (response) => {
            if (response?.error) alert(`Error: ${response.error}`);
        });
    }, [listId]);

    // Memoized items
    const filteredAndSortedItems = useMemo(() => {
        if (!items) return [];
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filtered = items.filter(item => item.name.toLowerCase().includes(lowerCaseSearchTerm));
        return [...filtered].sort((a, b) => a.completed === b.completed ? 0 : a.completed ? 1 : -1);
    }, [items, searchTerm]);

    // Other logic (confirm delete, controls)
    const confirmDeleteList = () => {
        if (window.confirm(t('delete_list_confirm', { listName: list.name }))) {
            onDeleteList(listId);
        }
    }
    const toggleControl = (controlType) => {
        setActiveControl(prev => (prev === controlType ? 'none' : controlType));
        if (controlType === 'search' && activeControl !== 'search') setSearchTerm(''); // Clear search on open
    };
    const closeActiveControl = () => {
        if (activeControl === 'search') setSearchTerm('');
        setActiveControl('none');
    };
    useEffect(() => {
        if (activeControl === 'search') {
            requestAnimationFrame(() => searchInputRef.current?.focus());
        }
    }, [activeControl]);

    // Render logic
    if (!list) return <div className="text-center p-10">{t('loading')}</div>;
    const showEmptyListMessage = items.length === 0 && !searchTerm && activeControl !== 'add';
    const showNoSearchResultsMessage = filteredAndSortedItems.length === 0 && items.length > 0 && searchTerm;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
             {/* Header */}
             <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                 <button onClick={onBack} className="text-primary dark:text-dark-primary hover:underline flex items-center gap-1">
                     <span className="material-symbols-rounded text-lg leading-none">arrow_back</span>{t('back_to_lists')}
                 </button>
                 <button onClick={confirmDeleteList} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-1">
                     <span className="material-symbols-rounded text-lg leading-none">delete_forever</span>{t('delete_list')}
                 </button>
             </div>
             {/* Title */}
             <h2 className="text-2xl font-semibold mb-3 text-primary dark:text-dark-primary text-center">{list.name}</h2>
              {/* Controls Row */}
             <div ref={controlsAnimationParent} className="flex items-center gap-2 my-3 py-2 border-b border-t border-gray-200 dark:border-gray-700 min-h-[56px]">
                 <button onClick={() => toggleControl('search')} className={`p-2 rounded-full transition-colors flex-shrink-0 ${activeControl === 'search' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`} aria-label={t(activeControl === 'search' ? 'close_search' : 'open_search')} aria-expanded={activeControl === 'search'} aria-controls="search-input-container">
                     <span className="material-symbols-rounded">search</span>
                 </button>
                 <button onClick={() => toggleControl('add')} className={`p-2 rounded-full transition-colors flex-shrink-0 ${activeControl === 'add' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`} aria-label={t(activeControl === 'add' ? 'close_add_item' : 'open_add_item')} aria-expanded={activeControl === 'add'} aria-controls="add-item-form-container">
                     <span className="material-symbols-rounded">add_circle</span>
                 </button>
                 {activeControl === 'search' && (
                     <div key="search-control" id="search-input-container" className="flex items-center flex-grow ml-1"> <input ref={searchInputRef} type="search" placeholder={t('search_items_placeholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" onKeyDown={(e) => e.key === 'Escape' && closeActiveControl()} aria-label={t('search_items_placeholder')} /> </div>
                 )}
                 {activeControl === 'add' && (
                     <div key="add-control" id="add-item-form-container" className="flex-grow"> <AddItemInlineForm listId={listId} onAddItem={handleAddItem} onCancel={closeActiveControl} /> </div>
                 )}
                 {activeControl === 'none' && ( <div key="none-control" className="flex-grow min-h-[40px]"></div> )}
             </div>
             {/* Item List Area */}
             {showEmptyListMessage ? ( <p className="text-gray-500 dark:text-gray-400 italic mt-4 text-center">{t('empty_list_message')}</p> )
              : showNoSearchResultsMessage ? ( <p className="text-center text-gray-500 dark:text-gray-400 italic mt-4">{t('no_search_results')}</p> )
              : ( <ul ref={listAnimationParent} className="list-none p-0 mb-4"> {filteredAndSortedItems.map(item => ( <ShoppingListItem key={item._id} item={item} onToggle={handleToggleItem} onDelete={handleDeleteItem} /> ))} </ul> )}
        </div>
    );
}


// --- AddListModal Component ---
// Includes focus and escape key handling
function AddListModal({ isOpen, onClose, onAddList }) {
    const { t } = useTranslation();
    const [listName, setListName] = useState('');
    const inputRef = useRef(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
             setTimeout(() => { inputRef.current?.focus(); }, 50);
        } else {
             setListName('');
        }
    }, [isOpen]);

    // Handle Escape key press
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onAddList(listName.trim());
        onClose();
    };

    if (!isOpen) return null;

    return (
        // Overlay
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-list-modal-title">
            {/* Modal Content Box */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter" onClick={(e) => e.stopPropagation()}>
                <h2 id="add-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">{t('create_list_button')}</h2>
                <form onSubmit={handleSubmit}>
                    <input ref={inputRef} type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder={t('new_list_placeholder')} className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent mb-4" aria-label={t('new_list_placeholder')} maxLength={100} />
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity"> {t('cancel_button', 'Cancel')} </button>
                        <button type="submit" className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"> {t('create_button', 'Create')} </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// --- ShoppingLists ---
// Uses button and modal for adding lists
function ShoppingLists({ lists, onSelectList, onAddList }) {
    const { t } = useTranslation();
    const [listAnimationParent] = useAutoAnimate();
    const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);

    const handleOpenModal = () => setIsAddListModalOpen(true);
    const handleCloseModal = () => setIsAddListModalOpen(false);

    const handleAddListAndCloseModal = (name) => {
         onAddList(name);
         handleCloseModal();
    };

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <h1 className="text-3xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('app_title')}</h1>
            {lists.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">{t('no_lists_message')}</p>
            ) : (
                <ul ref={listAnimationParent} className="space-y-2 list-none p-0 mb-6">
                    {lists.map(list => (
                        <li key={list._id} className="flex justify-between items-center p-3 bg-secondary/30 dark:bg-dark-secondary/30 rounded cursor-pointer hover:bg-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors" onClick={() => onSelectList(list._id)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectList(list._id)}>
                            <span className="font-medium text-text dark:text-dark-text break-words">{list.name}</span>
                            <span className="material-symbols-rounded text-primary dark:text-dark-primary" aria-hidden="true">chevron_right</span>
                        </li>
                    ))}
                </ul>
            )}
             <div className="mt-6 pt-4 border-t border-secondary dark:border-dark-secondary flex justify-center">
                 <button type="button" onClick={handleOpenModal} className="w-full sm:w-auto px-5 py-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                     <span className="material-symbols-rounded">add</span> {t('create_list_button')}
                 </button>
             </div>
             <AddListModal isOpen={isAddListModalOpen} onClose={handleCloseModal} onAddList={handleAddListAndCloseModal} />
        </div>
    );
}

// --- NEW: Login Component ---
function Login({ onLogin, error, setError }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const API_URL = import.meta.env.VITE_SERVER_URL;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
             setError(t('login_invalid_input', 'Please enter username and a 4-digit PIN.'));
             return;
        }
        setIsLoading(true);
        setError(null); // Clear previous errors

        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin }),
                 credentials: 'include' // **Important**: Send cookies with the request
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error ${response.status}`);
            }

            console.log("Login successful:", data);
            onLogin(data); // Pass user data up to App component

        } catch (err) {
            console.error("Login failed:", err);
            setError(err.message || t('login_failed_generic', 'Login failed. Please try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4">
            <div className="w-full max-w-xs p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6 text-center text-primary dark:text-dark-primary">
                    {t('login_title', 'Login')}
                </h1>
                {error && (
                    <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm">
                        {error}
                    </p>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('username_label', 'Username')}
                        </label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase())}
                            required
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                            autoCapitalize="none"
                        />
                    </div>
                    <div className="mb-6">
                        <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('pin_label', '4-Digit PIN')}
                        </label>
                        <input
                            type="password" // Use password type for masking
                            id="pin"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g,''))} // Allow only digits
                            required
                            maxLength="4"
                            minLength="4"
                            inputMode="numeric" // Hint for mobile numeric keyboard
                            pattern="\d{4}" // Basic pattern validation
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center"
                    >
                        {isLoading ? (
                             <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            t('login_button', 'Log In')
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}


// --- Main App Component ---
// Includes Auth State, Session Check, Conditional Rendering
function App() {
    const { t, i18n } = useTranslation();
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) return storedTheme === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [currentLanguage, setCurrentLanguage] = useState(i18n.language.split('-')[0]);

    // --- Authentication State ---
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState(null);

    const [lists, setLists] = useState([]);
    const [currentListId, setCurrentListId] = useState(null);
    const [currentListItems, setCurrentListItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // General loading for list/item data
    const [error, setError] = useState(null); // General errors

    const currentListIdRef = useRef(currentListId);
    useEffect(() => { currentListIdRef.current = currentListId; }, [currentListId]);

    const API_URL = import.meta.env.VITE_SERVER_URL;

    // --- Theme Handling (unchanged) ---
    useEffect(() => {
        if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
        else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
    }, [isDarkMode]);
    const toggleTheme = (isNowDark) => setIsDarkMode(isNowDark);

    // --- Language Handling (unchanged) ---
    const changeLanguage = (lng) => i18n.changeLanguage(lng);
    useEffect(() => {
        const handleLanguageChange = (lng) => setCurrentLanguage(lng.split('-')[0]);
        i18n.on('languageChanged', handleLanguageChange);
        setCurrentLanguage(i18n.language.split('-')[0]);
        return () => i18n.off('languageChanged', handleLanguageChange);
    }, [i18n]);


    // --- Logout Handler ---
    const handleLogout = useCallback(async (logoutMessage = null) => {
        console.log("Handling logout...");
        setError(null); // Clear general errors
        setAuthError(logoutMessage); // Set specific logout message if provided
        setCurrentUser(null); // Clear user state *first*
        setLists([]);
        setCurrentListId(null);
        setCurrentListItems([]);

        if (socket.connected) {
            console.log("Disconnecting socket on logout.");
            socket.disconnect();
        }

        if (API_URL) {
            try {
                await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                console.log("Server logout requested.");
            } catch (err) {
                console.error("Error requesting server logout:", err);
            }
        }
    }, [API_URL]); // Depend only on API_URL


     // --- Check Session on Load ---
    useEffect(() => {
        const checkUserSession = async () => {
             console.log("Checking user session...");
             setIsAuthLoading(true);
             setAuthError(null);
             if (!API_URL) {
                 setAuthError("Configuration Error: Server URL missing.");
                 setIsAuthLoading(false);
                 return;
             }
             try {
                const response = await fetch(`${API_URL}/api/auth/session`, { credentials: 'include' });
                if (response.status === 401) {
                    console.log("No valid session found.");
                    setCurrentUser(null);
                     if(socket.connected) socket.disconnect(); // Disconnect if session invalid
                } else if (response.ok) {
                    const userData = await response.json();
                    console.log("Session valid, user:", userData.username);
                    setCurrentUser(userData); // Set user state *before* connecting socket
                } else {
                     const errorData = await response.json().catch(() => ({ message: response.statusText }));
                     throw new Error(errorData.message || `HTTP error ${response.status}`);
                }
            } catch (err) {
                console.error("Session check failed:", err);
                setAuthError(`Session check failed: ${err.message}`);
                setCurrentUser(null);
                 if (socket.connected) socket.disconnect();
            } finally {
                setIsAuthLoading(false);
            }
        };
        checkUserSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [API_URL]); // Depend only on API_URL

    // --- Fetch Lists (Depends on currentUser) ---
    const fetchLists = useCallback(async () => {
         if (!currentUser || !API_URL) return;
        console.log("Fetching lists for user:", currentUser.username);
        setIsLoading(true); setError(null);
        try {
            const response = await fetch(`${API_URL}/api/lists`, { credentials: 'include' });
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: response.statusText }));
                 if (response.status === 401) { handleLogout(t('session_expired_error', 'Session expired, please log in again.')); }
                 throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch lists`);
            }
            setLists(await response.json());
        } catch (error) {
            console.error("Failed to fetch lists:", error); setError(`Failed to load lists: ${error.message}`); setLists([]);
        } finally {
            if (!currentListIdRef.current) setIsLoading(false);
        }
    }, [API_URL, currentUser, t, handleLogout]); // Add handleLogout

    // --- Fetch Items (Depends on currentUser) ---
    const fetchItemsForList = useCallback(async (listId) => {
        if (!listId || !currentUser || !API_URL) { setCurrentListItems([]); setIsLoading(false); return; }
        console.log(`Fetching items for list: ${listId}`);
        setIsLoading(true); setError(null);
        try {
            const response = await fetch(`${API_URL}/api/lists/${listId}/items`, { credentials: 'include' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                if (response.status === 401) { handleLogout(t('session_expired_error', 'Session expired, please log in again.')); }
                if (response.status === 404 || response.status === 403) { throw new Error(errorData.message || t('list_access_denied', 'List not found or access denied.')); }
                throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch items`);
            }
            setCurrentListItems(await response.json());
        } catch (error) {
            console.error(`Failed to fetch items for list ${listId}:`, error); setError(`Failed to load items for this list: ${error.message}`); setCurrentListItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL, currentUser, t, handleLogout]); // Add handleLogout

    // --- Socket Connection & Event Listeners (Depends on currentUser) ---
    useEffect(() => {
        if (!currentUser || !API_URL) {
             if (socket.connected) { console.log("Disconnecting socket (no user/URL)."); socket.disconnect(); }
             return;
        }

        console.log("Setting up socket listeners for:", currentUser.username);

        // --- Socket Listeners ---
        function onConnect() { console.log('Socket connected'); setIsConnected(true); setError(null); fetchLists(); if (currentListIdRef.current) { socket.emit('joinList', currentListIdRef.current); } }
        function onDisconnect(reason) { console.warn(`Socket disconnected! Reason: ${reason}`); setIsConnected(false); if (reason === 'io server disconnect') { handleLogout(t('session_expired_error', 'Session expired, please log in again.')); } else if (reason !== 'io client disconnect') { setError(t('connection_lost_error', 'Connection lost...')); } }
        function onConnectError(err) { console.error("Socket connection error:", err.message); if (err.message.includes('Authentication error')) { handleLogout(t('authentication_error', 'Authentication failed.')); } else { setError(t('connection_failed_error', `Connect failed: ${err.message}`)); } setIsConnected(false); }
        function onListsUpdated() { console.log("Lists updated event received"); fetchLists(); }
        function onListDeleted(deletedListId) { console.log("List deleted event received:", deletedListId); setLists(prev => prev.filter(l => l._id !== deletedListId)); if (currentListIdRef.current === deletedListId) { setCurrentListId(null); setCurrentListItems([]); } }
        function onItemAdded(newItem) { console.log("Item added event:", newItem); if (newItem.listId === currentListIdRef.current) { setCurrentListItems(prev => prev.some(i => i._id === newItem._id) ? prev : [...prev, newItem]); } }
        function onItemUpdated(updatedItem) { console.log("Item updated event:", updatedItem); if (updatedItem.listId === currentListIdRef.current) { setCurrentListItems(prev => prev.map(i => i._id === updatedItem._id ? updatedItem : i)); } }
        function onItemDeleted(deletedItemId) { console.log("Item deleted event:", deletedItemId); setCurrentListItems(prev => prev.filter(i => i._id !== deletedItemId)); }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('listsUpdated', onListsUpdated);
        socket.on('listDeleted', onListDeleted);
        socket.on('itemAdded', onItemAdded);
        socket.on('itemUpdated', onItemUpdated);
        socket.on('itemDeleted', onItemDeleted);

        // Connect socket only if user is set and not already connected
        if (!socket.connected) {
             console.log("Connecting socket...");
             // Socket middleware will use cookie for auth
             socket.connect();
        }

        return () => { // Cleanup
            console.log("Cleaning up socket listeners for:", currentUser?.username);
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            socket.off('listsUpdated', onListsUpdated);
            socket.off('listDeleted', onListDeleted);
            socket.off('itemAdded', onItemAdded);
            socket.off('itemUpdated', onItemUpdated);
            socket.off('itemDeleted', onItemDeleted);
            // Do not disconnect here unless the App component itself unmounts
        };
    }, [currentUser, API_URL, fetchLists, fetchItemsForList, t, handleLogout]); // Include handleLogout

    // --- Login Handler ---
    const handleLogin = (userData) => {
        console.log("Handling login, setting user:", userData.username);
        setCurrentUser(userData);
        setAuthError(null);
        // Socket connection & data fetch triggered by useEffect watching currentUser
    };

    // --- List/Item Actions (Rely on backend auth checks) ---
    const handleSelectList = (listId) => { if (!currentUser || currentListId === listId) return; if (currentListIdRef.current) socket.emit('leaveList', currentListIdRef.current); setCurrentListId(listId); setCurrentListItems([]); fetchItemsForList(listId); socket.emit('joinList', listId); };
    const handleBackToLists = () => { if (!currentUser) return; if (currentListIdRef.current) socket.emit('leaveList', currentListIdRef.current); setCurrentListId(null); setCurrentListItems([]); setError(null); };
    const handleAddList = (listName) => { if (!currentUser) return; const nameToSend = listName || t('new_list_placeholder'); socket.emit('addList', nameToSend, (res) => { if (res?.error) setError(res.error); else setError(null); }); };
    const handleDeleteList = (listId) => { if (!currentUser) return; socket.emit('deleteList', listId, (res) => { if (res?.error) setError(res.error); else setError(null); }); };

    // --- Render Logic ---
    const currentList = currentUser && !isLoading && lists.find(list => list._id === currentListId);

    if (isAuthLoading) {
        return ( <div className="flex justify-center items-center min-h-screen bg-background dark:bg-dark-background"> <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-dark-primary"></div> </div> );
    }

    return (
        <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">
            {!currentUser ? (
                <Login onLogin={handleLogin} error={authError} setError={setAuthError} />
            ) : (
                <>
                    <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
                         <button onClick={() => handleLogout()} title={t('logout_button_title', 'Log out')} className="p-1.5 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary dark:focus:ring-dark-primary focus:ring-offset-background dark:focus:ring-offset-dark-background">
                             <span className="material-symbols-rounded text-lg leading-none">logout</span>
                         </button>
                        <LanguageToggle currentLang={currentLanguage} onChangeLang={changeLanguage} />
                        <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
                    </div>

                    <main className="max-w-2xl mx-auto p-4 pt-20">
                        <div className="text-center mb-4 text-xs min-h-[1.2em]">
                            {error ? ( <span className="text-red-600 dark:text-red-400 font-semibold">{error}</span> )
                             : authError ? ( <span className="text-red-600 dark:text-red-400 font-semibold">{authError}</span>) // Show auth error here too
                             : ( <span className={`transition-opacity duration-300 ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400 animate-pulse'}`}> {isConnected ? t('status_connected') : t('status_disconnected')} </span> )
                            }
                        </div>

                         <div className="text-center mb-4 text-sm text-gray-500 dark:text-gray-400">
                             Logged in as: <span className="font-medium text-primary dark:text-dark-primary">{currentUser.username}</span>
                         </div>

                        {isLoading && !currentListId ? (
                            <div className="flex justify-center items-center p-10"> <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary"></div> <span className="ml-3 text-gray-500 dark:text-gray-400">{t('loading')}</span> </div>
                        ) : currentListId && currentList ? (
                            <ShoppingListDetail list={currentList} items={currentListItems} onBack={handleBackToLists} onDeleteList={handleDeleteList} />
                         ) : (
                            <ShoppingLists lists={lists} onSelectList={handleSelectList} onAddList={handleAddList} />
                        )}
                    </main>
                </>
            )}
        </div>
    );
}

export default App;