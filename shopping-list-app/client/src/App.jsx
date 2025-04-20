// client/src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';

// --- Custom useSwipe Hook (No changes) ---
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
        // Optionally close after submit by calling onCancel() if needed
        // onCancel?.();
        // Optionally keep focus or move focus depending on desired UX
         inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission if wrapped in a form
            handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };

    // Container div gets flex-grow
    return (
        <div className="flex gap-2 items-center flex-grow ml-1">
            <input
                ref={inputRef}
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('add_item_placeholder')}
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" // Ensure consistent height
                required
                aria-label={t('add_item_placeholder')}
            />
            <button
                type="button" // Explicitly type="button" to prevent form submission if nested
                onClick={handleSubmit}
                disabled={!itemName.trim()} // Disable button if input is empty
                className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-10" // Ensure consistent height
            >
                {t('add_button')}
            </button>
        </div>
    );
}


// --- ShoppingListItem ---
// **MODIFIED** Add touch-manipulation to label
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
                     // Increased padding from py-3 to py-4 for more height
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
                {/* **MODIFIED**: Added touch-manipulation class */}
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


// --- ShoppingListDetail (No changes) ---
function ShoppingListDetail({ list, items, onBack, onDeleteList }) {
    const { t } = useTranslation();
    const listId = list?._id;
    const [listAnimationParent] = useAutoAnimate();
    const [controlsAnimationParent] = useAutoAnimate();

    const [searchTerm, setSearchTerm] = useState('');
    const [activeControl, setActiveControl] = useState('none'); // 'none', 'search', 'add'
    const searchInputRef = useRef(null); // Ref for search input

    // Memoize filtered and sorted items for performance
    const filteredAndSortedItems = useMemo(() => {
        if (!items) return [];
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filtered = items.filter(item =>
            item.name.toLowerCase().includes(lowerCaseSearchTerm)
        );
        // Sort: incomplete first, then completed
        return [...filtered].sort((a, b) => {
            if (a.completed === b.completed) {
                // Optionally sort by name or date added if completion status is the same
                 // return a.name.localeCompare(b.name);
                 return 0; // Maintain original order for items with same status
            }
            return a.completed ? 1 : -1; // false (incomplete) comes first
        });
    }, [items, searchTerm]);

    // --- Callbacks ---
    const handleAddItem = useCallback((targetListId, itemName) => {
        console.log(`Emitting addItem for list ${targetListId}: ${itemName}`);
        socket.emit('addItem', { listId: targetListId, itemName }, (response) => {
            if (response?.error) {
                console.error("Error adding item:", response.error);
                 alert(`Error: ${response.error}`); // Basic user feedback
            } else {
                console.log("Item added successfully via socket:", response);
                // Keep the add form open for potentially adding more items
                // setActiveControl('add'); // Ensure it stays open if desired
            }
        });
    }, []);

    const handleToggleItem = useCallback((itemId) => {
        if (!listId) return;
        console.log(`Emitting toggleItem for item ${itemId} in list ${listId}`);
        socket.emit('toggleItem', { listId, itemId }, (response) => {
            if (response?.error) {
                console.error("Error toggling item:", response.error);
                 alert(`Error: ${response.error}`); // Basic user feedback
            } else {
                console.log("Item toggled successfully via socket:", response);
                 // **Important**: If using swipe, avoid rapid toggles. Consider adding
                 // a small delay or debounce if issues arise from quick successive toggles.
            }
        });
    }, [listId]);

    const handleDeleteItem = useCallback((itemId) => {
        if (!listId) return;
        // Consider a less intrusive confirmation or none at all for item deletion
        // if (window.confirm(t('delete_item_confirm'))) {
            console.log(`Emitting deleteItem for item ${itemId} in list ${listId}`);
            socket.emit('deleteItem', { listId, itemId }, (response) => {
                if (response?.error) {
                    console.error("Error deleting item:", response.error);
                     alert(`Error: ${response.error}`); // Basic user feedback
                } else {
                    console.log("Item deleted successfully via socket", response); // Response might contain success message
                }
            });
        // }
    }, [listId, t]);

    const confirmDeleteList = () => {
        if (window.confirm(t('delete_list_confirm', { listName: list.name }))) {
            onDeleteList(listId);
        }
    }

    // Toggle which control (search or add) is active, or hide both
    const toggleControl = (controlType) => {
        setActiveControl(prev => {
            if (prev === controlType) {
                // If clicking the active control again, close it
                if (controlType === 'search') setSearchTerm(''); // Clear search when closing
                return 'none';
            } else {
                // Switching to a new control
                if (controlType === 'search') {
                    setSearchTerm(''); // Clear search term when opening search
                    // Focus the search input when it becomes active
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                 }
                // Add other specific actions when switching if needed
                return controlType;
            }
        });
    };

    // Close the currently active control (e.g., on Escape key)
    const closeActiveControl = () => {
        if (activeControl === 'search') setSearchTerm('');
        setActiveControl('none');
    }

     // Effect to focus search input when it becomes active
     useEffect(() => {
         if (activeControl === 'search') {
             // Use requestAnimationFrame to ensure the element is rendered before focusing
             requestAnimationFrame(() => {
                 searchInputRef.current?.focus();
             });
         }
     }, [activeControl]);


    // Loading state
    if (!list) return <div className="text-center p-10">{t('loading')}</div>;

    // Message conditions
    const showEmptyListMessage = items.length === 0 && !searchTerm && activeControl !== 'add';
    const showNoSearchResultsMessage = filteredAndSortedItems.length === 0 && items.length > 0 && searchTerm;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                <button onClick={onBack} className="text-primary dark:text-dark-primary hover:underline flex items-center gap-1">
                     <span className="material-symbols-rounded text-lg leading-none">arrow_back</span>
                    {t('back_to_lists')}
                </button>
                <button onClick={confirmDeleteList} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-1">
                     <span className="material-symbols-rounded text-lg leading-none">delete_forever</span>
                    {t('delete_list')}
                </button>
            </div>

            {/* List Title */}
            <h2 className="text-2xl font-semibold mb-3 text-primary dark:text-dark-primary text-center">{list.name}</h2>

            {/* --- Controls Row --- */}
            <div
                ref={controlsAnimationParent}
                className="flex items-center gap-2 my-3 py-2 border-b border-t border-gray-200 dark:border-gray-700 min-h-[56px]" // Consistent min-height for layout stability
            >
                {/* Search Toggle Button */}
                <button
                    onClick={() => toggleControl('search')}
                    className={`p-2 rounded-full transition-colors flex-shrink-0 ${activeControl === 'search' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`}
                    aria-label={t(activeControl === 'search' ? 'close_search' : 'open_search')}
                    aria-expanded={activeControl === 'search'}
                     aria-controls="search-input-container" // Link button to the element it controls
                >
                    <span className="material-symbols-rounded">search</span>
                </button>

                {/* Add Item Toggle Button */}
                <button
                    onClick={() => toggleControl('add')}
                    className={`p-2 rounded-full transition-colors flex-shrink-0 ${activeControl === 'add' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`}
                    aria-label={t(activeControl === 'add' ? 'close_add_item' : 'open_add_item')}
                    aria-expanded={activeControl === 'add'}
                    aria-controls="add-item-form-container" // Link button to the element it controls
                >
                    <span className="material-symbols-rounded">add_circle</span>
                </button>

                {/* Expanded Area (Search Input OR Add Form) */}
                 {/* Use key prop to help animation library detect changes */}
                {activeControl === 'search' && (
                    <div key="search-control" id="search-input-container" className="flex items-center flex-grow ml-1">
                        <input
                             ref={searchInputRef} // Assign ref here
                            type="search"
                            placeholder={t('search_items_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                             className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" // Consistent height
                            onKeyDown={(e) => e.key === 'Escape' && closeActiveControl()}
                            aria-label={t('search_items_placeholder')}
                        />
                     </div>
                )}

                {activeControl === 'add' && (
                     <div key="add-control" id="add-item-form-container" className="flex-grow">
                         <AddItemInlineForm
                            listId={listId}
                            onAddItem={handleAddItem}
                            onCancel={closeActiveControl}
                         />
                    </div>
                )}
                 {/* Placeholder when neither is active to maintain height, styled invisibly */}
                 {activeControl === 'none' && (
                      <div key="none-control" className="flex-grow min-h-[40px]"></div> // Adjust min-height to match input height
                 )}
            </div>


            {/* Item List Area */}
            {showEmptyListMessage ? (
                 <p className="text-gray-500 dark:text-gray-400 italic mt-4 text-center">{t('empty_list_message')}</p>
            ) : showNoSearchResultsMessage ? (
                 <p className="text-center text-gray-500 dark:text-gray-400 italic mt-4">{t('no_search_results')}</p>
            ) : (
                <ul ref={listAnimationParent} className="list-none p-0 mb-4">
                    {filteredAndSortedItems.map(item => (
                        <ShoppingListItem
                            key={item._id}
                            item={item}
                            onToggle={handleToggleItem}
                            onDelete={handleDeleteItem}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}


// --- AddListModal Component (NEW) ---
function AddListModal({ isOpen, onClose, onAddList }) {
    const { t } = useTranslation();
    const [listName, setListName] = useState('');
    const inputRef = useRef(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
             // Use setTimeout to ensure the input is rendered and focusable after the modal transition (if any)
             setTimeout(() => {
                inputRef.current?.focus();
            }, 50); // Small delay often helps
        } else {
             // Reset name when closing
             setListName('');
        }
    }, [isOpen]);

    // Handle Escape key press
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleSubmit = (e) => {
        e.preventDefault(); // Prevent default form submission
        const trimmedName = listName.trim();
        onAddList(trimmedName); // onAddList from App will handle the empty name case
        onClose(); // Close modal after submission
    };

    if (!isOpen) {
        return null; // Don't render anything if not open
    }

    return (
        // Overlay
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out"
            onClick={onClose} // Close on overlay click
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-list-modal-title"
        >
            {/* Modal Content Box */}
            <div
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter"
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
            >
                {/* Add Tailwind keyframes for modal enter animation if desired */}
                {/* Example (in your global CSS or index.css):
                    @keyframes modal-enter {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    .animate-modal-enter { animation: modal-enter 0.2s ease-out forwards; }
                */}
                <h2 id="add-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">{t('create_list_button')}</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={listName}
                        onChange={(e) => setListName(e.target.value)}
                        placeholder={t('new_list_placeholder')}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent mb-4"
                        aria-label={t('new_list_placeholder')}
                        maxLength={100}
                    />
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity"
                        >
                             {t('cancel_button', 'Cancel')} {/* Add translation key if needed */}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
                        >
                            {t('create_button', 'Create')} {/* Add translation key if needed */}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// --- ShoppingLists ---
// **MODIFIED** Removed AddListForm, added button and modal state/trigger
function ShoppingLists({ lists, onSelectList, onAddList }) {
    const { t } = useTranslation();
    const [listAnimationParent] = useAutoAnimate();
    const [isAddListModalOpen, setIsAddListModalOpen] = useState(false); // State for modal

    const handleOpenModal = () => setIsAddListModalOpen(true);
    const handleCloseModal = () => setIsAddListModalOpen(false);

    // Wrap the original onAddList to close the modal
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
                <ul ref={listAnimationParent} className="space-y-2 list-none p-0 mb-6"> {/* Add margin-bottom */}
                    {lists.map(list => (
                        <li key={list._id}
                            className="flex justify-between items-center p-3 bg-secondary/30 dark:bg-dark-secondary/30 rounded cursor-pointer hover:bg-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors"
                            onClick={() => onSelectList(list._id)}
                            role="button" // Indicate it's clickable
                            tabIndex={0} // Make it focusable
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectList(list._id)} // Keyboard accessible
                        >
                            <span className="font-medium text-text dark:text-dark-text break-words">{list.name}</span>
                             {/* Use a more descriptive icon for clarity */}
                            <span className="material-symbols-rounded text-primary dark:text-dark-primary" aria-hidden="true">chevron_right</span>
                        </li>
                    ))}
                </ul>
            )}
             {/* **MODIFIED**: Replaced AddListForm with a button */}
             <div className="mt-6 pt-4 border-t border-secondary dark:border-dark-secondary flex justify-center">
                 <button
                     type="button"
                     onClick={handleOpenModal}
                     className="w-full sm:w-auto px-5 py-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90 flex items-center justify-center gap-2 transition-opacity"
                 >
                     <span className="material-symbols-rounded">add</span>
                     {t('create_list_button')}
                 </button>
             </div>

             {/* Render the modal */}
             <AddListModal
                isOpen={isAddListModalOpen}
                onClose={handleCloseModal}
                onAddList={handleAddListAndCloseModal}
             />
        </div>
    )
}

// --- Main App Component (No changes) ---
function App() {
    const { t, i18n } = useTranslation();
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // 1. Check localStorage
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) return storedTheme === 'dark';
        // 2. Check prefers-color-scheme media query
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const [currentLanguage, setCurrentLanguage] = useState(i18n.language.split('-')[0]);

    const [lists, setLists] = useState([]);
    const [currentListId, setCurrentListId] = useState(null);
    const [currentListItems, setCurrentListItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // Combined loading state
    const [error, setError] = useState(null); // Global error state

    // Ref to track the current list ID, useful inside socket event listeners
    const currentListIdRef = useRef(currentListId);
    useEffect(() => {
        currentListIdRef.current = currentListId;
    }, [currentListId]);

    // --- Theme Handling ---
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = (isNowDark) => {
        setIsDarkMode(isNowDark);
    };

    // --- Language Handling ---
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng); // i18next handles updating 'currentLanguage' state via event listener
    };

    useEffect(() => {
        const handleLanguageChange = (lng) => setCurrentLanguage(lng.split('-')[0]);
        i18n.on('languageChanged', handleLanguageChange);
        // Set initial language based on i18n's detected language
        setCurrentLanguage(i18n.language.split('-')[0]);
        return () => {
            i18n.off('languageChanged', handleLanguageChange);
        };
    }, [i18n]);

    // --- API Base URL ---
    const API_URL = import.meta.env.VITE_SERVER_URL;

    // --- Fetch Initial Data ---
    const fetchLists = useCallback(async () => {
        console.log("Fetching lists...");
        if (!API_URL) {
            setError("Server URL is not configured.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null); // Clear previous errors
        try {
            const response = await fetch(`${API_URL}/api/lists`);
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: response.statusText }));
                 throw new Error(`HTTP error ${response.status}: ${errorData.message || 'Failed to fetch lists'}`);
            }
            const data = await response.json();
            setLists(data);
            console.log("Lists fetched:", data.length);
        } catch (error) {
            console.error("Failed to fetch lists:", error);
            setError(`Failed to load lists: ${error.message}`);
            setLists([]);
        } finally {
             // Only stop loading indicator if not currently viewing a specific list
            if (!currentListIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [API_URL]); // Depend on API_URL

    const fetchItemsForList = useCallback(async (listId) => {
        if (!listId) {
            setCurrentListItems([]);
            setIsLoading(false); // Stop loading if no list ID
            return;
        };
         if (!API_URL) {
            setError("Server URL is not configured.");
            setIsLoading(false);
            return;
        }
        console.log(`Fetching items for list: ${listId}`);
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/api/lists/${listId}/items`);
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: response.statusText }));
                 throw new Error(`HTTP error ${response.status}: ${errorData.message || 'Failed to fetch items'}`);
            }
            const data = await response.json();
            setCurrentListItems(data);
            console.log("Items fetched:", data.length);
        } catch (error) {
            console.error(`Failed to fetch items for list ${listId}:`, error);
            setError(`Failed to load items for this list: ${error.message}`);
            setCurrentListItems([]); // Clear items on error
        } finally {
            setIsLoading(false); // Always stop loading after fetching items
        }
    }, [API_URL]); // Depend on API_URL

    // --- Socket Connection & Event Listeners ---
    useEffect(() => {
        console.log("Setting up socket listeners...");

        function onConnect() {
            console.log('Socket connected!');
            setIsConnected(true);
            setError(null); // Clear connection errors on successful connect
            fetchLists(); // Refresh lists on connect/reconnect
            if (currentListIdRef.current) {
                console.log("Re-joining list room:", currentListIdRef.current);
                socket.emit('joinList', currentListIdRef.current);
                fetchItemsForList(currentListIdRef.current); // Re-fetch items for current list
            }
        }

        function onDisconnect(reason) {
            console.warn(`Socket disconnected! Reason: ${reason}`);
            setIsConnected(false);
            // Optionally set an error message if the disconnection wasn't planned
            if (reason !== 'io client disconnect') { // Don't show error if we disconnected manually
                setError("Connection lost. Attempting to reconnect...");
            }
        }

        function onConnectError(err) {
            console.error("Socket connection attempt failed:", err.message);
            setError(`Failed to connect: ${err.message}. Retrying...`);
             setIsConnected(false);
        }

        // --- Data Update Handlers ---
        function onListsUpdated() {
            console.log("Received listsUpdated event, fetching lists...");
            fetchLists();
        }

        function onListDeleted(deletedListId) {
            console.log("Received listDeleted event for ID:", deletedListId);
             // Update the list state locally first for faster UI feedback
             setLists(prevLists => prevLists.filter(list => list._id !== deletedListId));
             // If the currently viewed list was deleted, navigate back
            if (currentListIdRef.current === deletedListId) {
                console.log("Current list deleted, navigating back.");
                setCurrentListId(null);
                setCurrentListItems([]);
            }
            // No need to call fetchLists again, already handled by local update and listDeleted event
        }

        function onItemAdded(newItem) {
            console.log("Received itemAdded:", newItem);
            // Add item only if we are viewing the correct list
            if (newItem.listId === currentListIdRef.current) {
                // Use functional update to avoid stale state issues
                setCurrentListItems(prevItems => {
                     // Avoid adding duplicates if event arrives multiple times quickly
                     if (prevItems.some(item => item._id === newItem._id)) {
                         return prevItems;
                     }
                     return [...prevItems, newItem];
                });
            }
        }

        function onItemUpdated(updatedItem) {
            console.log("Received itemUpdated:", updatedItem);
            if (updatedItem.listId === currentListIdRef.current) {
                 setCurrentListItems(prevItems =>
                    prevItems.map(item => item._id === updatedItem._id ? updatedItem : item)
                );
            }
        }

        function onItemDeleted(deletedItemId) {
            console.log("Received itemDeleted:", deletedItemId);
             // Filter out item only if we are viewing the correct list (though backend ensures this)
             // Check if item exists before filtering (might be redundant but safe)
             setCurrentListItems(prevItems => prevItems.filter(item => item._id !== deletedItemId));
        }


        // --- Register listeners ---
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError); // Handle initial connection errors
        socket.on('listsUpdated', onListsUpdated);
        socket.on('listDeleted', onListDeleted);
        socket.on('itemAdded', onItemAdded);
        socket.on('itemUpdated', onItemUpdated);
        socket.on('itemDeleted', onItemDeleted);

        // --- Connect the socket ---
        // Ensure API_URL is available before connecting
        if (API_URL) {
            console.log("Calling socket.connect()");
            socket.connect();
        } else {
             console.error("Cannot connect socket: VITE_SERVER_URL is not set.");
             setError("Configuration error: Server URL missing.");
             setIsLoading(false);
        }


        // --- Cleanup listeners on component unmount ---
        return () => {
            console.log("Cleaning up socket listeners...");
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
             socket.off('connect_error', onConnectError);
            socket.off('listsUpdated', onListsUpdated);
            socket.off('listDeleted', onListDeleted);
            socket.off('itemAdded', onItemAdded);
            socket.off('itemUpdated', onItemUpdated);
            socket.off('itemDeleted', onItemDeleted);
            // Optionally disconnect if the app component unmounts entirely
            // This prevents lingering connections if the component is part of a larger app
            // console.log("Calling socket.disconnect() on cleanup");
            // socket.disconnect();
        };
    }, [fetchLists, fetchItemsForList, API_URL]); // Add API_URL dependency

    // --- Actions ---
    const handleSelectList = (listId) => {
        if (currentListId === listId) return; // Avoid unnecessary actions if already selected

        // Leave the previous room if there was one
        if (currentListIdRef.current) {
            console.log("Leaving previous list room:", currentListIdRef.current);
            socket.emit('leaveList', currentListIdRef.current);
        }

        console.log("Selecting list:", listId);
        setCurrentListId(listId); // Update state
        setCurrentListItems([]); // Clear previous items immediately
        fetchItemsForList(listId); // Fetch new items (will set loading state)

        // Join the new room
        console.log("Joining new list room:", listId);
        socket.emit('joinList', listId);
    };

    const handleBackToLists = () => {
        if (currentListIdRef.current) {
            console.log("Leaving list room:", currentListIdRef.current);
            socket.emit('leaveList', currentListIdRef.current);
        }
        setCurrentListId(null);
        setCurrentListItems([]);
        setError(null); // Clear list-specific errors when going back
    };

    // **MODIFIED** onAddList now handles empty name case using translation
    const handleAddList = (listName) => {
         const nameToSend = listName || t('new_list_placeholder'); // Use placeholder from translation if empty
        console.log("Emitting addList:", nameToSend);
        socket.emit('addList', nameToSend, (response) => {
            if (response?.error) {
                console.error("Error adding list:", response.error);
                setError(`Failed to add list: ${response.error}`); // Show error
            } else {
                console.log("List added via socket, response:", response);
                // listsUpdated event will handle fetching new list data
                setError(null); // Clear error on success
            }
        });
    };

    const handleDeleteList = (listId) => {
        console.log("Emitting deleteList:", listId);
        socket.emit('deleteList', listId, (response) => {
            if (response?.error) {
                console.error("Error deleting list:", response.error);
                setError(`Failed to delete list: ${response.error}`); // Show error
            } else {
                console.log("List delete requested via socket, response:", response);
                 // listDeleted event will handle UI updates
                setError(null); // Clear error on success
            }
        });
    };

    // --- Render Logic ---
    const currentList = !isLoading && lists.find(list => list._id === currentListId);

    return (
        <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">
            {/* Toggles Container */}
            <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
                <LanguageToggle
                    currentLang={currentLanguage}
                    onChangeLang={changeLanguage}
                />
                <ThemeToggle
                    isDarkMode={isDarkMode}
                    onToggle={toggleTheme}
                />
            </div>

            <main className="max-w-2xl mx-auto p-4 pt-20">
                 {/* Connection Status / Global Error Display */}
                 <div className="text-center mb-4 text-xs min-h-[1.2em]"> {/* Ensure space even when empty */}
                    {error ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">{error}</span>
                    ) : (
                         <span className={`transition-opacity duration-300 ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400 animate-pulse'}`}>
                            {isConnected ? t('status_connected') : t('status_disconnected')}
                        </span>
                    )}
                </div>


                {/* Main Content Area */}
                {isLoading ? (
                     // More prominent loading indicator
                     <div className="flex justify-center items-center p-10">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary"></div>
                          <span className="ml-3 text-gray-500 dark:text-gray-400">{t('loading')}</span>
                     </div>
                ) : currentListId && currentList ? (
                    // Render List Detail View
                    <ShoppingListDetail
                        list={currentList}
                        items={currentListItems}
                        onBack={handleBackToLists}
                        onDeleteList={handleDeleteList}
                        // Pass down handlers for item actions (already done via socket events, but could pass callbacks if preferred)
                    />
                ) : !API_URL && !isLoading ? (
                     // Specific error for missing configuration
                     <div className="text-center p-10 text-red-600 dark:text-red-400">
                         Configuration Error: VITE_SERVER_URL is not set. Please check your <code>client/.env</code> file.
                     </div>
                ) : (
                     // Render Lists Overview
                    <ShoppingLists
                        lists={lists}
                        onSelectList={handleSelectList}
                        onAddList={handleAddList} // Pass down the App's handleAddList
                    />
                )}
            </main>

             {/* Optional Footer */}
            {/* <footer className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
                My Shopping App
            </footer> */}
        </div>
    );
}

export default App;