// client/src/ShoppingListDetail.jsx
// Description: Component to display the details of a single shopping list,
// including its items, header, and controls for adding, searching, and managing items.
// Handles user interactions within the list context and delegates actions (online/offline).

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';
import { socket } from './socket'; // Needed for direct online emits
import ShareListModal from './ShareListModal';
import { PlusIcon } from '@heroicons/react/24/solid';

// --- Constants for Tap Detection ---
const TAP_DURATION_THRESHOLD = 250; // ms
const TAP_MOVE_THRESHOLD = 10; // pixels

// --- useSwipe Hook ---
// Custom hook to detect swipe-right and tap gestures on list items.
const useSwipe = (elementRef, { onSwipeRight, onTap, threshold = 50 }) => {
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);
    const touchStartTime = useRef(null);
    const touchCurrentX = useRef(null);
    const isSwiping = useRef(false);
    const isTapPossible = useRef(true);

    const handleTouchStart = useCallback((e) => {
        if (e.touches.length === 1) {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
            touchStartTime.current = Date.now();
            touchCurrentX.current = e.touches[0].clientX;
            isSwiping.current = false;
            isTapPossible.current = true;
             if (elementRef.current) {
                 elementRef.current.style.transition = 'none'; // Disable transition during drag
                 elementRef.current.style.setProperty('--swipe-progress', '0');
             }
        }
    }, [elementRef]);

    const handleTouchMove = useCallback((e) => {
        if (touchStartX.current === null || touchStartY.current === null || e.touches.length > 1) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - touchStartX.current;
        const deltaY = currentY - touchStartY.current;
        touchCurrentX.current = currentX;

        // If significant movement occurs, it's not a tap
        if (isTapPossible.current && (Math.abs(deltaX) > TAP_MOVE_THRESHOLD || Math.abs(deltaY) > TAP_MOVE_THRESHOLD)) {
            isTapPossible.current = false;
        }

        // Detect if it's predominantly a horizontal swipe
        if (!isSwiping.current && Math.abs(deltaX) > TAP_MOVE_THRESHOLD) {
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) { // More horizontal than vertical
                isSwiping.current = true;
                isTapPossible.current = false; // Once swiping, it's not a tap
                 if (e.cancelable) e.preventDefault(); // Prevent vertical scroll while swiping horizontally
            } else {
                // Moved too much vertically relative to horizontally, not a swipe candidate
                isTapPossible.current = false;
            }
        }

         if (isSwiping.current) {
             if (e.cancelable) e.preventDefault();
             const offset = Math.max(0, deltaX); // Only allow rightward movement visually
             if (elementRef.current) {
                 // Apply visual transformation based on swipe distance
                 elementRef.current.style.transform = `translateX(${offset * 0.6}px)`; // Dampen movement
                 // Update CSS variable for background reveal based on progress towards threshold
                 const progress = Math.min(1, Math.max(0, offset / (threshold * 1.5)));
                 elementRef.current.style.setProperty('--swipe-progress', `${progress}`);
             }
         }
    }, [elementRef, threshold]);


    const handleTouchEnd = useCallback(() => {
        const startTime = touchStartTime.current;
        const startX = touchStartX.current;
        const startY = touchStartY.current;
        const currentX = touchCurrentX.current;
        const wasSwiping = isSwiping.current;
        const wasTapPossible = isTapPossible.current;

        // Reset state
        touchStartTime.current = null;
        touchStartX.current = null;
        touchStartY.current = null;
        touchCurrentX.current = null;
        isSwiping.current = false;
        isTapPossible.current = true;

        // Reset visual style with transition
        if (elementRef.current) {
             elementRef.current.style.transition = 'transform 0.2s ease-out, background-color 0.2s ease-out';
             elementRef.current.style.transform = 'translateX(0px)'; // Snap back
             // Reset swipe progress (needs to be slightly delayed or in next frame to allow transition)
             requestAnimationFrame(() => { if (elementRef.current) elementRef.current.style.setProperty('--swipe-progress', '0'); });
        }

        if (startTime === null || startX === null || startY === null || currentX === null) return; // Should not happen

        const duration = Date.now() - startTime;
        const deltaX = currentX - startX;

        // Determine if it was a tap or a valid swipe
        const isTap = wasTapPossible && duration < TAP_DURATION_THRESHOLD;
        const isValidSwipe = wasSwiping && deltaX > threshold;

        if (isTap) {
             onTap?.();
        } else if (isValidSwipe) {
            onSwipeRight?.();
        }

    }, [onSwipeRight, onTap, threshold, elementRef]);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        // Add event listeners
        element.addEventListener('touchstart', handleTouchStart, { passive: true }); // Passive for start is ok
        element.addEventListener('touchmove', handleTouchMove, { passive: false }); // Needs to be non-passive to prevent scroll
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
        element.addEventListener('touchcancel', handleTouchEnd, { passive: true }); // Treat cancel like end
        return () => {
            // Cleanup listeners
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            element.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]);
};

// --- AddItemInlineForm ---
// Form component for adding new items directly within the list view.
function AddItemInlineForm({ listId, onAddItem, onCancel, isOnline, queueItemAction }) {
    const { t } = useTranslation();
    const [itemName, setItemName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []); // Focus input on mount

    const handleSubmit = () => {
        const trimmedName = itemName.trim();
        if (!trimmedName || !listId) return; // Prevent empty submissions

        if (isOnline) {
            // If online, call the handler that emits directly via socket
            onAddItem(listId, trimmedName);
        } else {
            // If offline, create a temporary ID and queue the action
            const tempItemId = `temp_${crypto.randomUUID()}`;
            // Structure for optimistic update (applyActionLocally will add flags)
            const newItem = {
                _id: tempItemId, tempId: tempItemId, name: trimmedName,
                completed: false, listId: listId,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                // Include creator if available/needed: creator: currentUser?._id
            };
            // Action payload for queueing and sync
            const action = {
                type: 'addItem',
                payload: {
                    listId: listId,
                    item: newItem, // Full item for optimistic update
                    tempItemId: tempItemId, // Temp ID for mapping during sync
                    itemName: trimmedName // Item name needed for server emit during sync
                }
                // Unique ID is added by queueItemAction in App.jsx
            };
            queueItemAction(action);
        }
        setItemName(''); // Clear input after submit
        inputRef.current?.focus(); // Keep focus for adding multiple items
    };

    // Handle Enter key for submit and Escape key for cancel
    const handleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } else if (e.key === 'Escape') onCancel?.(); };

    return (
        <div className="flex gap-2 items-center w-full">
            <input ref={inputRef} type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} onKeyDown={handleKeyDown} placeholder={t('add_item_placeholder')} className="flex-1 p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" required aria-label={t('add_item_placeholder')}/>
            <button type="button" onClick={handleSubmit} disabled={!itemName.trim()} className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-10 px-4">{t('add_button')}</button>
        </div>
    );
}


// --- ShoppingListItem ---
// Component representing a single item in the shopping list.
// Handles display, toggle (via checkbox, tap, swipe), and deletion.
function ShoppingListItem({ item, onToggle, onDelete, isOnline, queueItemAction }) {
    const { t } = useTranslation();
    const listItemRef = useRef(null);
    const wasTapHandled = useRef(false); // Prevent double toggle from tap + checkbox change

    // Use the real _id if available (synced), otherwise use tempId (offline)
    const effectiveItemId = item._id || item.tempId;

    // Action handler for toggling item completion status
    const handleToggleAction = useCallback((itemId) => {
        if (!item?.listId || !itemId) return; // Ensure we have necessary IDs
        if (isOnline) {
            onToggle(itemId); // Call the online handler (emits socket event from App.jsx)
        } else {
             // Queue offline action
             const action = { type: 'toggleItem', payload: { listId: item.listId, itemId: itemId } };
             // Unique ID is added by queueItemAction in App.jsx
             queueItemAction(action);
        }
    }, [isOnline, onToggle, queueItemAction, item?.listId]); // Depends on item.listId

    // Action handler for deleting an item
    const handleDeleteAction = useCallback((itemId) => {
         if (!item || !itemId) return;
         // Confirm deletion with user
         if (window.confirm(t('delete_item_confirm', { itemName: item.name }))) {
             if (isOnline) {
                 onDelete(itemId); // Call online handler (emits socket event from App.jsx)
             } else {
                 // Queue offline action
                 const action = { type: 'deleteItem', payload: { listId: item.listId, itemId: itemId } };
                 // Unique ID is added by queueItemAction in App.jsx
                 queueItemAction(action);
             }
         }
     }, [isOnline, onDelete, queueItemAction, item, t]); // Depends on full item for name/listId


    // Tap handler: Trigger toggle action
    const handleTap = useCallback(() => { if(!effectiveItemId) return; wasTapHandled.current = true; handleToggleAction(effectiveItemId); setTimeout(() => { wasTapHandled.current = false; }, 100); }, [handleToggleAction, effectiveItemId]);
    // Setup swipe detection using the custom hook
    useSwipe(listItemRef, { onSwipeRight: () => effectiveItemId && handleToggleAction(effectiveItemId), onTap: handleTap, threshold: 60 });
    // Checkbox change handler: Trigger toggle, but prevent if tap was just handled
    const handleInputChange = useCallback(() => { if(!effectiveItemId) return; if (wasTapHandled.current) { wasTapHandled.current = false; return; } handleToggleAction(effectiveItemId); }, [handleToggleAction, effectiveItemId]);

    return (
        <li className="relative my-1 rounded overflow-hidden bg-background dark:bg-dark-background group shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
            {/* Background Reveal on Swipe */}
            <div className={`absolute inset-0 flex items-center justify-start pl-4 transition-opacity duration-100 ease-in opacity-0 ${item.completed ? 'bg-yellow-400/80 dark:bg-yellow-600/80' : 'bg-green-400/80 dark:bg-green-600/80'} opacity-[--swipe-progress]`} aria-hidden="true" style={{'--swipe-progress': 0}}>
                <span className={`material-symbols-rounded text-xl ${item.completed ? 'text-yellow-800 dark:text-yellow-200' : 'text-green-800 dark:text-green-200'}`}>{item.completed ? 'undo' : 'check_circle'}</span>
            </div>
            {/* Foreground Content */}
            <div ref={listItemRef} className={`relative flex items-center justify-between py-3 px-3 rounded transition-all duration-300 ease-in-out z-10 group touch-manipulation ${item.completed ? 'bg-green-100 dark:bg-green-900/60 opacity-80' : 'bg-background dark:bg-dark-background hover:bg-gray-50 dark:hover:bg-gray-800/50'}`} style={{ '--swipe-progress': 0 }}>
                <label htmlFor={`item-${effectiveItemId}`} className="flex items-center gap-3 flex-grow cursor-pointer mr-2 min-w-0 touch-manipulation">
                    {/* Hidden actual checkbox, controlled by visual span */}
                    <input id={`item-${effectiveItemId}`} type="checkbox" checked={!!item.completed} onChange={handleInputChange} className="absolute opacity-0 w-0 h-0 peer" aria-hidden="true" tabIndex={-1} />
                    {/* Custom Checkbox Visual */}
                    <span className={`flex-shrink-0 w-5 h-5 border-2 rounded transition-colors duration-200 ease-in-out flex items-center justify-center ${item.completed ? 'bg-primary dark:bg-dark-primary border-primary dark:border-dark-primary' : 'bg-white dark:bg-gray-700 border-primary/50 dark:border-dark-primary/50 peer-focus:ring-2 peer-focus:ring-offset-1 peer-focus:ring-offset-transparent peer-focus:ring-accent dark:peer-focus:ring-dark-accent'}`} aria-hidden="true">
                        {item.completed && (<svg className="w-3 h-3 text-white dark:text-dark-background" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>)}
                    </span>
                    {/* Item Name & Offline Indicator */}
                    <span className={`flex-grow transition-colors break-words ${item.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-text dark:text-dark-text'}`}>
                         {item.name}
                         {/* Offline Indicator (Cloud Off Icon) */}
                         {item.isOffline && (
                            <span className="material-symbols-rounded text-xs text-amber-500 ml-1.5 align-middle" title={t('offline_change_tooltip')}>cloud_off</span>
                         )}
                    </span>
                </label>
                {/* Delete Button (Visible on Hover/Focus) */}
                <button onClick={() => handleDeleteAction(effectiveItemId)} className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-lg font-bold flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity duration-150" aria-label={t('delete_item_label', { itemName: item.name })}>
                    <span className="material-symbols-rounded text-xl leading-none align-middle">delete</span>
                </button>
            </div>
        </li>
    );
}


// --- ShoppingListDetail ---
// Main component for viewing and interacting with a single shopping list.
function ShoppingListDetail({ list, items = [], currentUser, isOnline, queueItemAction, onBack, onDeleteList, onError, onTogglePrivacy }) {
    const { t } = useTranslation();
    // Use the real _id if available, otherwise the tempId for context
    const listId = list?._id || list?.tempId;
    const [listAnimationParent] = useAutoAnimate(); // Animate item list changes
    const [controlsAnimationParent] = useAutoAnimate(); // Animate control bar changes
    const [ownerControlsAnimationParent] = useAutoAnimate(); // Animate owner controls section
    const [searchTerm, setSearchTerm] = useState('');
    const [activeControl, setActiveControl] = useState('none'); // 'none', 'add', 'search'
    const searchInputRef = useRef(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Determine if the current user owns this list
    const isOwner = useMemo(() => { return !!currentUser?._id && !!list?.owner?._id && currentUser._id === list.owner._id; }, [currentUser, list?.owner?._id]);

    // --- Action Handlers (Online - Emit directly via socket) ---
    // These handlers are called when online=true. They now live in App.jsx and are passed down.
    // For clarity, let's rename the props slightly.
    const handleAddItemOnline = useCallback((targetListId, itemName) => { socket.emit('addItem', { listId: targetListId, itemName }, (res) => { if (res?.error) onError(t('error_adding_item', { message: res.error })); else onError(null); }); }, [onError, t]);
    const handleToggleItemOnline = useCallback((itemId) => { if (!listId) return; socket.emit('toggleItem', { listId: listId, itemId: itemId }, (res) => { if (res?.error) onError(t('error_updating_item', { message: res.error })); else onError(null); }); }, [listId, onError, t]);
    const handleDeleteItemOnline = useCallback((itemId) => { if (!listId) return; socket.emit('deleteItem', { listId: listId, itemId: itemId }, (res) => { if (res?.error) onError(t('error_deleting_item', { message: res.error })); else onError(null); }); }, [listId, onError, t]);


    // --- Other UI Handlers ---
    const handleOpenShareModal = () => {
        // Allow sharing only for lists that are synced (have a real _id) and user is owner
        if (isOwner && list?._id && !list.tempId) {
            onError(null); // Clear previous errors
            setIsShareModalOpen(true);
        } else if (list?.tempId) {
             onError(t('share_unavailable_offline_list')); // Specific error for temp lists
        } else if (!isOwner) {
            onError(t('share_unavailable_not_owner')); // Should ideally disable button instead
        }
    };
    const handleCloseShareModal = () => setIsShareModalOpen(false);

    // Focus search input when search control becomes active
    useEffect(() => { if (activeControl === 'search') requestAnimationFrame(() => searchInputRef.current?.focus()); }, [activeControl]);

    // Filter and sort items based on search term and completion status
    const filteredAndSortedItems = useMemo(() => {
        if (!Array.isArray(items)) return []; // Ensure items is an array
        const term = searchTerm.toLowerCase();
        const filtered = items.filter(item => item.name && item.name.toLowerCase().includes(term));
        // Sort by completion status (incomplete first), then maybe by name or date?
        // For now, just by completion status.
        return [...filtered].sort((a, b) => a.completed === b.completed ? 0 : a.completed ? 1 : -1);
    }, [items, searchTerm]); // Re-run when items or search term changes

    // Confirm list deletion with user before calling parent handler
    const confirmDeleteList = () => { if (window.confirm(t('delete_list_confirm', { listName: list.name }))) { onDeleteList(listId); } };

    // Toggle between 'add', 'search', and 'none' active controls
    const toggleControl = (type) => { setActiveControl(p => (p === type ? 'none' : type)); if (type === 'search' && activeControl === 'search') setSearchTerm(''); else if (type !== 'search' && activeControl === 'search') setSearchTerm(''); };
    // Close the active control (clears search or hides add form)
    const closeActiveControl = () => { if (activeControl === 'search') setSearchTerm(''); setActiveControl('none'); };

    // --- Render Logic ---
    if (!list) return <div className="text-center p-10">{t('loading')}</div>; // Loading or error state

    // Conditions for displaying messages
    const showEmptyListMessage = items.length === 0 && !searchTerm && activeControl !== 'add';
    const showNoSearchResultsMessage = items.length > 0 && filteredAndSortedItems.length === 0 && searchTerm;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg max-w-2xl mx-auto">
             {/* Header: Back button, List Name, Owner Actions (Share/Delete) */}
             <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 gap-2">
                 <button onClick={onBack} className="text-primary dark:text-dark-primary hover:underline flex items-center gap-1 text-sm sm:text-base flex-shrink-0"><span className="material-symbols-rounded text-lg leading-none">arrow_back</span>{t('back_to_lists')}</button>
                 <h2 className="text-xl sm:text-2xl font-semibold text-primary dark:text-dark-primary text-center flex-grow mx-2 truncate" title={list.name}>{list.name}</h2>
                 {/* Owner actions only visible if user is owner */}
                 {isOwner && (
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {/* Share button disabled if list is temporary (offline) or user offline */}
                        <button onClick={handleOpenShareModal} disabled={!!list.tempId || !isOnline} className={`p-1.5 sm:p-2 rounded-full transition-colors text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed`} title={list.tempId ? t('share_unavailable_offline_list') : t('share_list_button_title')}><span className="material-symbols-rounded">share</span></button>
                        <button onClick={confirmDeleteList} className="p-1.5 sm:p-2 rounded-full transition-colors text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50" title={t('delete_list')}><span className="material-symbols-rounded">delete_forever</span></button>
                    </div>
                 )}
                 {/* Placeholder to balance layout if not owner */}
                 {!isOwner && <div className="w-12 sm:w-16 flex-shrink-0"></div>}
             </div>

              {/* Controls Row: Search, Add, and inline forms */}
             <div ref={controlsAnimationParent} className="flex items-center gap-2 my-3 py-2 border-b border-t border-gray-200 dark:border-gray-700 min-h-[56px]">
                 {/* Search Toggle Button */}
                 <button onClick={() => toggleControl('search')} className={`p-2 rounded-full transition-colors flex-shrink-0 flex items-center justify-center ${activeControl === 'search' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`} aria-label={t(activeControl === 'search' ? 'close_search' : 'open_search')} aria-expanded={activeControl === 'search'}><span className="material-symbols-rounded">search</span></button>
                 {/* Add Item Toggle Button */}
                 <button onClick={() => toggleControl('add')} className={`p-2 rounded-full transition-colors flex-shrink-0 text-white flex items-center justify-center ${activeControl === 'add' ? 'bg-emerald-600 dark:bg-emerald-700 ring-2 ring-emerald-300 ring-offset-1 ring-offset-background dark:ring-offset-dark-background' : 'bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-700'}`} aria-label={t(activeControl === 'add' ? 'close_add_item' : 'open_add_item')} aria-expanded={activeControl === 'add'}><PlusIcon className="h-5 w-5" /></button>

                 {/* Conditional Rendering based on activeControl */}
                 {activeControl === 'search' && (<div key="search-c" className="flex items-center flex-grow ml-1 min-w-0"><input ref={searchInputRef} type="search" placeholder={t('search_items_placeholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" onKeyDown={(e) => e.key === 'Escape' && closeActiveControl()} aria-label={t('search_items_placeholder')} /></div>)}
                 {activeControl === 'add' && (<div key="add-c" className="flex-grow min-w-0 ml-1"><AddItemInlineForm listId={listId} onAddItem={handleAddItemOnline} onCancel={closeActiveControl} isOnline={isOnline} queueItemAction={queueItemAction} /></div>)}
                 {activeControl === 'none' && (<div key="none-c" className="flex-grow min-h-[40px]"></div>)} {/* Placeholder */}
             </div>

             {/* Item List Area */}
             {showEmptyListMessage ? ( <p className="text-gray-500 dark:text-gray-400 italic mt-4 text-center">{t('empty_list_message')}</p> )
              : showNoSearchResultsMessage ? ( <p className="text-center text-gray-500 dark:text-gray-400 italic mt-4">{t('no_search_results')}</p> )
              : (
                  // Render the list of items using ShoppingListItem component
                  // The `items` prop comes directly from App.jsx state now
                  <ul ref={listAnimationParent} className="list-none p-0 mb-4">
                      {filteredAndSortedItems.map(item => (
                          <ShoppingListItem
                              key={item._id || item.tempId} // Use real or temp ID as key
                              item={item}
                              onToggle={handleToggleItemOnline} // Pass online handler
                              onDelete={handleDeleteItemOnline} // Pass online handler
                              isOnline={isOnline} // Pass online status
                              queueItemAction={queueItemAction} // Pass queueing function for offline
                          />
                      ))}
                 </ul>
              )}

             {/* Owner Controls: Privacy Toggle */}
             {isOwner && (
                 <div ref={ownerControlsAnimationParent} className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-6">
                     {/* Privacy Setting Display and Toggle Button */}
                     <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
                        <div className="flex items-center gap-2 flex-wrap flex-grow mr-2">
                           <span className={`material-symbols-rounded ${list.isPublic ? 'text-blue-500' : 'text-yellow-600'}`}>{list.isPublic ? 'public' : 'lock'}</span>
                           <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{list.isPublic ? t('list_privacy_public') : t('list_privacy_private')}</span>
                           <span className="text-xs text-gray-500 dark:text-gray-400">({list.isPublic ? t('list_public_info') : t('list_private_info')})</span>
                           {/* Show offline indicator if list state is marked as offline */}
                           {list.isOffline && ( <span className="material-symbols-rounded text-xs text-amber-500 ml-1 flex-shrink-0" title={t('offline_change_tooltip')}>cloud_off</span> )}
                        </div>
                        <button onClick={() => onTogglePrivacy(listId)} disabled={!isOnline || !!list.tempId} className="px-3 py-1 rounded bg-primary dark:bg-dark-primary text-white text-xs hover:opacity-90 transition-opacity flex items-center gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-rounded text-sm">{list.isPublic ? 'lock' : 'public'}</span>
                            {list.isPublic ? t('make_private') : t('make_public')}
                        </button>
                     </div>
                      {/* Removed redundant sharing info here, handled by modal */}
                 </div>
             )}
             {/* Share Modal (conditionally rendered) */}
             <ShareListModal
                isOpen={isShareModalOpen}
                onClose={handleCloseShareModal}
                listId={list?._id} // Pass real ID for sharing
                listName={list?.name || ''}
                currentOwnerId={list?.owner?._id}
                currentAllowedUsers={list?.allowedUsers || []}
                isListPublic={list?.isPublic || false}
                onError={onError}
             />
        </div>
    );
}

export default ShoppingListDetail;