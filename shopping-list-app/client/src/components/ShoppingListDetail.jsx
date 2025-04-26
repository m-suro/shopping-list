// client/src/ShoppingListDetail.jsx
// Description: Component to display the details of a single shopping list,
// including its items, header, and controls for adding, searching, and managing items.
// Handles user interactions within the list context and delegates actions (online/offline).
// ** MODIFIED: Added Quantity display, button, modal, and prop handling **
// ** MODIFIED: Added onOpenShareModal prop and the Share button **

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';
import { socket } from '../socket'; // Needed for direct online emits
// Assuming ShareListModal is now implemented separately
// import ShareListModal from './ShareListModal'; // Removed import from here, now handled in App.jsx
import QuantityModal from './modals/QuantityModal'; // <-- Import QuantityModal
import { PlusIcon, CheckIcon, XMarkIcon, ChatBubbleLeftEllipsisIcon, TrashIcon, TagIcon, UserGroupIcon } from '@heroicons/react/24/solid'; // <-- Added UserGroupIcon for Share

// --- Constants for Tap Detection ---
const TAP_DURATION_THRESHOLD = 250; // ms
const TAP_MOVE_THRESHOLD = 10; // pixels

// --- useSwipe Hook ---
const useSwipe = (elementRef, { onSwipeRight, onTap, threshold = 50 }) => { const touchStartX = useRef(null); const touchStartY = useRef(null); const touchStartTime = useRef(null); const touchCurrentX = useRef(null); const isSwiping = useRef(false); const isTapPossible = useRef(true); const handleTouchStart = useCallback((e) => { if (e.touches.length === 1) { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; touchStartTime.current = Date.now(); touchCurrentX.current = e.touches[0].clientX; isSwiping.current = false; isTapPossible.current = true; if (elementRef.current) { elementRef.current.style.transition = 'none'; elementRef.current.style.setProperty('--swipe-progress', '0'); } } }, [elementRef]); const handleTouchMove = useCallback((e) => { if (touchStartX.current === null || touchStartY.current === null || e.touches.length > 1) return; const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; const deltaX = currentX - touchStartX.current; const deltaY = currentY - touchStartY.current; touchCurrentX.current = currentX; if (isTapPossible.current && (Math.abs(deltaX) > TAP_MOVE_THRESHOLD || Math.abs(deltaY) > TAP_MOVE_THRESHOLD)) { isTapPossible.current = false; } if (!isSwiping.current && Math.abs(deltaX) > TAP_MOVE_THRESHOLD) { if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) { isSwiping.current = true; isTapPossible.current = false; if (e.cancelable) e.preventDefault(); } else { isTapPossible.current = false; } } if (isSwiping.current) { if (e.cancelable) e.preventDefault(); const offset = Math.max(0, deltaX); if (elementRef.current) { elementRef.current.style.transform = `translateX(${offset * 0.6}px)`; const progress = Math.min(1, Math.max(0, offset / (threshold * 1.5))); elementRef.current.style.setProperty('--swipe-progress', `${progress}`); } } }, [elementRef, threshold]); const handleTouchEnd = useCallback(() => { const startTime = touchStartTime.current; const startX = touchStartX.current; const startY = touchStartY.current; const currentX = touchCurrentX.current; const wasSwiping = isSwiping.current; const wasTapPossible = isTapPossible.current; touchStartTime.current = null; touchStartX.current = null; touchStartY.current = null; touchCurrentX.current = null; isSwiping.current = false; isTapPossible.current = true; if (elementRef.current) { elementRef.current.style.transition = 'transform 0.2s ease-out, background-color 0.2s ease-out'; elementRef.current.style.transform = 'translateX(0px)'; requestAnimationFrame(() => { if (elementRef.current) elementRef.current.style.setProperty('--swipe-progress', '0'); }); } if (startTime === null || startX === null || startY === null || currentX === null) return; const duration = Date.now() - startTime; const deltaX = currentX - startX; const isTap = wasTapPossible && duration < TAP_DURATION_THRESHOLD; const isValidSwipe = wasSwiping && deltaX > threshold; if (isTap) onTap?.(); else if (isValidSwipe) onSwipeRight?.(); }, [onSwipeRight, onTap, threshold, elementRef]); useEffect(() => { const element = elementRef.current; if (!element) return; element.addEventListener('touchstart', handleTouchStart, { passive: true }); element.addEventListener('touchmove', handleTouchMove, { passive: false }); element.addEventListener('touchend', handleTouchEnd, { passive: true }); element.addEventListener('touchcancel', handleTouchEnd, { passive: true }); return () => { element.removeEventListener('touchstart', handleTouchStart); element.removeEventListener('touchmove', handleTouchMove); element.removeEventListener('touchend', handleTouchEnd); element.removeEventListener('touchcancel', handleTouchEnd); }; }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]); };

// --- AddItemInlineForm ---
function AddItemInlineForm({ listId, onAddItem, onCancel, isOnline, queueItemAction }) { const { t } = useTranslation(); const [itemName, setItemName] = useState(''); const inputRef = useRef(null); useEffect(() => { inputRef.current?.focus(); }, []); const handleSubmit = () => { const trimmedName = itemName.trim(); if (!trimmedName || !listId) return; if (isOnline) { onAddItem(listId, trimmedName); } else { const tempItemId = `temp_${crypto.randomUUID()}`; const newItem = { _id: tempItemId, tempId: tempItemId, name: trimmedName, completed: false, listId: listId, quantityValue: null, quantityUnit: '', comment: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), }; const action = { type: 'addItem', payload: { listId: listId, item: newItem, tempItemId: tempItemId, itemName: trimmedName } }; queueItemAction(action); } setItemName(''); inputRef.current?.focus(); }; const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } else if (e.key === 'Escape') onCancel?.(); }; return ( <div className="flex gap-2 items-center w-full"> <input ref={inputRef} type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} onKeyDown={handleKeyDown} placeholder={t('add_item_placeholder')} className="flex-1 p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" required aria-label={t('add_item_placeholder')}/> <button type="button" onClick={handleSubmit} disabled={!itemName.trim()} className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-10 px-4">{t('add_button')}</button> </div> ); }


// --- ShoppingListItem ---
// ** MODIFIED: Added quantity display, state, modal, button, and props **
function ShoppingListItem({
    item,
    listId: parentListId,
    onToggle,
    onDelete,
    onUpdateComment,
    onUpdateItemQuantity, // <-- New prop
    isOnline,
    queueItemAction
}) {
    const { t } = useTranslation();
    const listItemRef = useRef(null);
    const commentInputRef = useRef(null);
    const wasTapHandled = useRef(false);
    const [buttonContainerRef] = useAutoAnimate({ duration: 150 });

    const [isExpanded, setIsExpanded] = useState(false); // For comment
    const [isEditing, setIsEditing] = useState(false); // For comment
    const [editedComment, setEditedComment] = useState(item.comment || '');
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false); // <-- State for quantity modal

    const effectiveItemId = item._id || item.tempId;

    useEffect(() => { if (!isEditing) { setEditedComment(item.comment || ''); } }, [item.comment, isEditing]);

    // --- Action Handlers ---
    const handleToggleAction = useCallback((itemId) => { if (!parentListId || !itemId) return; if (isOnline) { onToggle(itemId); } else { const action = { type: 'toggleItem', payload: { listId: parentListId, itemId: itemId } }; queueItemAction(action); } }, [isOnline, onToggle, queueItemAction, parentListId]);
    const performDeleteAction = useCallback((itemId) => { if (!item || !itemId || !parentListId) return; if (isOnline) { onDelete(itemId); } else { const action = { type: 'deleteItem', payload: { listId: parentListId, itemId: itemId } }; queueItemAction(action); } setIsConfirmingDelete(false); }, [isOnline, onDelete, queueItemAction, item, parentListId]);
    const handleDeleteClick = () => { setIsConfirmingDelete(true); };
    const handleCancelDelete = () => { setIsConfirmingDelete(false); };

    // --- Comment Handlers ---
    const handleEditComment = () => { if (isEditing) return; setEditedComment(item.comment || ''); setIsEditing(true); setIsExpanded(true); setTimeout(() => commentInputRef.current?.focus(), 0); };
    const handleCancelEdit = () => { setIsEditing(false); setEditedComment(item.comment || ''); };
    const handleSaveComment = (itemIdToSave, listIdToSave) => { if (!itemIdToSave || !listIdToSave) { console.error(`[ShoppingListItem] Save aborted: Missing ID. ItemID: ${itemIdToSave}, ListID: ${listIdToSave}`); setIsEditing(false); return; } const trimmedComment = editedComment.trim(); const originalComment = (item.comment || '').trim(); if (trimmedComment !== originalComment) { if (typeof onUpdateComment === 'function') { onUpdateComment(itemIdToSave, trimmedComment); } else { console.error("[ShoppingListItem] ERROR: onUpdateComment prop is not a function!", onUpdateComment); } } setIsEditing(false); };
    const handleCommentKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveComment(effectiveItemId, parentListId); } else if (e.key === 'Escape') { handleCancelEdit(); } };

    // --- Quantity Handlers ---
    const handleOpenQuantityModal = () => {
        setIsQuantityModalOpen(true);
    };

    const handleSaveQuantity = (newValue, newUnit) => {
        // Check if values actually changed before calling the update function
        const valueChanged = item.quantityValue !== newValue;
        const unitChanged = item.quantityUnit !== newUnit;

        if (valueChanged || unitChanged) {
            if (typeof onUpdateItemQuantity === 'function') {
                onUpdateItemQuantity(effectiveItemId, newValue, newUnit);
            } else {
                console.error("onUpdateItemQuantity prop is not a function!");
            }
        }
        setIsQuantityModalOpen(false); // Close modal after save attempt
    };

    // --- Swipe/Tap Handlers ---
    const handleTap = useCallback(() => { if(!effectiveItemId) return; wasTapHandled.current = true; handleToggleAction(effectiveItemId); setTimeout(() => { wasTapHandled.current = false; }, 100); }, [handleToggleAction, effectiveItemId]);
    useSwipe(listItemRef, { onSwipeRight: () => effectiveItemId && handleToggleAction(effectiveItemId), onTap: handleTap, threshold: 60 });
    const handleInputChange = useCallback(() => { if(!effectiveItemId) return; if (wasTapHandled.current) { wasTapHandled.current = false; return; } handleToggleAction(effectiveItemId); }, [handleToggleAction, effectiveItemId]);


    // --- Derived State & Display ---
    const hasComment = !!item.comment && item.comment.trim().length > 0;
    const showCommentSection = hasComment || isEditing;
    const hasQuantity = item.quantityValue !== null; // Check if quantity value is set

    return (
        <> {/* Use Fragment because we are adding the modal at the same level */}
            <li className="relative my-1 rounded overflow-hidden bg-background dark:bg-dark-background group/item shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-700">
                {/* Swipe Indicator */}
                <div className={`absolute inset-0 flex items-center justify-start pl-4 transition-opacity duration-100 ease-in opacity-0 ${item.completed ? 'bg-yellow-400/80 dark:bg-yellow-600/80' : 'bg-green-400/80 dark:bg-green-600/80'} opacity-[--swipe-progress]`} aria-hidden="true" style={{'--swipe-progress': 0}}> <span className={`material-symbols-rounded text-xl ${item.completed ? 'text-yellow-800 dark:text-yellow-200' : 'text-green-800 dark:text-green-200'}`}>{item.completed ? 'undo' : 'check_circle'}</span> </div>

                {/* Main Item Content */}
                <div ref={listItemRef} className={`relative z-10 transition-all duration-300 ease-in-out touch-manipulation rounded ${item.completed ? 'bg-green-100 dark:bg-green-900/60 opacity-80' : 'bg-background dark:bg-dark-background'}`} style={{ '--swipe-progress': 0 }}>
                    <div className="flex items-center justify-between py-3 px-3 gap-2">
                        {/* Checkbox and Name/Quantity */}
                        <label htmlFor={`item-${effectiveItemId}`} className="flex items-center gap-3 flex-grow cursor-pointer mr-2 min-w-0 touch-manipulation">
                            <input id={`item-${effectiveItemId}`} type="checkbox" checked={!!item.completed} onChange={handleInputChange} className="absolute opacity-0 w-0 h-0 peer" aria-hidden="true" tabIndex={-1} />
                            {/* Checkbox Visual */}
                            <span className={`flex-shrink-0 w-5 h-5 border-2 rounded transition-colors duration-200 ease-in-out flex items-center justify-center ${item.completed ? 'bg-primary dark:bg-dark-primary border-primary dark:border-dark-primary' : 'bg-white dark:bg-gray-700 border-primary/50 dark:border-dark-primary/50 peer-focus:ring-2 peer-focus:ring-offset-1 peer-focus:ring-offset-transparent peer-focus:ring-accent dark:peer-focus:ring-dark-accent'}`} aria-hidden="true"> {item.completed && (<svg className="w-3 h-3 text-white dark:text-dark-background" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>)} </span>
                            {/* Name and Quantity Display */}
                            <span className={`flex-grow transition-colors break-words ${item.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-text dark:text-dark-text'}`}>
                                {item.name}
                                {hasQuantity && (
                                    <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400 font-normal">
                                        ({item.quantityValue}{item.quantityUnit ? ` ${item.quantityUnit}` : ''})
                                    </span>
                                )}
                                {item.isOffline && ( <span className="material-symbols-rounded text-xs text-amber-500 ml-1.5 align-middle" title={t('offline_change_tooltip')}>cloud_off</span> )}
                            </span>
                        </label>

                        {/* Action Buttons Area */}
                        <div ref={buttonContainerRef} className="flex items-center flex-shrink-0 gap-1.5">
                             {/* Quantity Button (visible unless confirming delete) */}
                             {!isConfirmingDelete && (
                                <button
                                    onClick={handleOpenQuantityModal}
                                    className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors flex items-center justify-center aspect-square"
                                    title={t('item_quantity_button_title', 'Set quantity')}
                                >
                                    <TagIcon className="h-5 w-5" />
                                </button>
                             )}

                            {/* Comment Button (visible unless confirming delete) */}
                            {!isConfirmingDelete && ( <button onClick={handleEditComment} className="p-1.5 rounded-md bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-center aspect-square" title={hasComment ? t('item_comment_edit_tooltip', 'Edit comment') : t('item_comment_add_tooltip', 'Add comment')}> <ChatBubbleLeftEllipsisIcon className="h-5 w-5" /> </button> )}

                            {/* Delete Confirmation Section */}
                            {isConfirmingDelete ? ( <> <button onClick={handleCancelDelete} className="p-1.5 rounded-md bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-center aspect-square" aria-label={t('cancel_button')} title={t('cancel_button')}> <XMarkIcon className="h-5 w-5" /> </button> <button onClick={() => performDeleteAction(effectiveItemId)} className="px-3 py-1.5 h-[34px] text-xs rounded-md bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600 transition-colors flex items-center justify-center" title={t('confirm_button')}> {t('confirm_button')} </button> </> ) : ( <button onClick={handleDeleteClick} className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 hover:text-red-700 dark:hover:text-red-200 transition-colors flex items-center justify-center aspect-square" aria-label={t('delete_item_label', { itemName: item.name })} title={t('delete_button')}> <span className="material-symbols-rounded text-xl leading-none flex items-center justify-center">delete</span> </button> )}
                        </div>
                    </div>

                    {/* Comment Section (remains unchanged) */}
                    {showCommentSection && ( <div className={`pl-10 pr-3 pb-2 transition-all duration-300 ease-in-out ${item.completed ? 'opacity-70' : ''}`}> {isEditing ? ( <div className="space-y-2"> <textarea ref={commentInputRef} value={editedComment} onChange={(e) => setEditedComment(e.target.value)} onKeyDown={handleCommentKeyDown} placeholder={t('item_comment_placeholder', 'Add a comment...')} className="w-full p-1.5 border rounded bg-white dark:bg-gray-600 text-text dark:text-dark-text border-primary/50 dark:border-dark-primary/50 focus:ring-1 focus:ring-accent dark:focus:ring-dark-accent text-sm resize-y min-h-[40px]" rows={2} maxLength={500} /> <div className="flex justify-end gap-2"> <button onClick={handleCancelEdit} className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title={t('cancel_button')}> <XMarkIcon className="h-5 w-5" /> </button> <button onClick={() => { handleSaveComment(effectiveItemId, parentListId); }} className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300" title={t('save_button')}> <CheckIcon className="h-5 w-5" /> </button> </div> </div> ) : ( <div className="flex items-start justify-between gap-2 group/comment"> <div className={`flex-grow text-xs text-gray-600 dark:text-gray-400 py-1 cursor-pointer min-h-[24px] break-words ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`} onClick={handleEditComment} title={t('item_comment_edit_tooltip', 'Click to edit comment')} > {item.comment} </div> <button onClick={() => setIsExpanded(!isExpanded)} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 opacity-0 group-hover/comment:opacity-100 focus:opacity-100 transition-opacity duration-150" aria-expanded={isExpanded} title={isExpanded ? t('item_comment_collapse', 'Collapse') : t('item_comment_expand', 'Expand')} > <span className={`material-symbols-rounded text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span> </button> </div> )} </div> )}
                </div>
            </li>
            {/* Render Quantity Modal conditionally */}
            <QuantityModal
                isOpen={isQuantityModalOpen}
                onClose={() => setIsQuantityModalOpen(false)}
                currentItemName={item.name}
                currentQuantityValue={item.quantityValue}
                currentQuantityUnit={item.quantityUnit}
                onSaveQuantity={handleSaveQuantity}
            />
        </>
    );
}


// --- ShoppingListDetail ---
// ** MODIFIED: Accept and pass down onUpdateItemQuantity prop **
// ** MODIFIED: Accept onOpenShareModal prop and call it **
function ShoppingListDetail({
    list,
    items = [],
    currentUser,
    isOnline,
    queueItemAction,
    onBack,
    onDeleteList,
    onError,
    onTogglePrivacy,
    onUpdateComment,
    onUpdateItemQuantity, // <-- New prop
    onOpenShareModal // <-- New prop
}) {
    const { t } = useTranslation();
    const listId = list?._id || list?.tempId;
    const [listAnimationParent] = useAutoAnimate();
    const [controlsAnimationParent] = useAutoAnimate();
    const [ownerControlsAnimationParent] = useAutoAnimate();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeControl, setActiveControl] = useState('none');
    const searchInputRef = useRef(null);
    // Share modal state is now handled in App.jsx
    // const [isShareModalOpen, setIsShareModalOpen] = useState(false); // Removed
    const isOwner = useMemo(() => { return !!currentUser?._id && !!list?.owner?._id && currentUser._id === list.owner._id; }, [currentUser, list?.owner?._id]);
    const handleAddItemOnline = useCallback((targetListId, itemName) => { socket.emit('addItem', { listId: targetListId, itemName }, (res) => { if (res?.error) onError(t('error_adding_item', { message: res.error })); else onError(null); }); }, [onError, t]);
    const handleToggleItemOnline = useCallback((itemId) => { if (!listId) return; socket.emit('toggleItem', { listId: listId, itemId: itemId }, (res) => { if (res?.error) onError(t('error_updating_item', { message: res.error })); else onError(null); }); }, [listId, onError, t]);
    const handleDeleteItemOnline = useCallback((itemId) => { if (!listId) return; socket.emit('deleteItem', { listId: listId, itemId: itemId }, (res) => { if (res?.error) onError(t('error_deleting_item', { message: res.error })); else onError(null); }); }, [listId, onError, t]);
    // Simplified handleOpenShareModal here, just calls the prop
    const handleOpenShareClick = () => {
        if (typeof onOpenShareModal === 'function') {
            // Pass the full list object up to App.jsx
             onOpenShareModal(list);
        } else {
             console.error("onOpenShareModal prop is not a function!");
             // Show an error via the onError prop if the handler is missing
             onError(t('share_feature_unavailable'));
        }
    };
    // handleCloseShareModal and ShareModal are handled in App.jsx now
    // const handleCloseShareModal = () => setIsShareModalOpen(false); // Removed
    useEffect(() => { if (activeControl === 'search') requestAnimationFrame(() => searchInputRef.current?.focus()); }, [activeControl]);
    const filteredAndSortedItems = useMemo(() => { if (!Array.isArray(items)) return []; const term = searchTerm.toLowerCase(); const filtered = items.filter(item => item.name && item.name.toLowerCase().includes(term)); return [...filtered].sort((a, b) => a.completed === b.completed ? 0 : a.completed ? 1 : -1); }, [items, searchTerm]);
    const confirmDeleteList = () => { if (window.confirm(t('delete_list_confirm', { listName: list.name }))) { onDeleteList(listId); } };
    const toggleControl = (type) => { setActiveControl(p => (p === type ? 'none' : type)); if (type === 'search' && activeControl === 'search') setSearchTerm(''); else if (type !== 'search' && activeControl === 'search') setSearchTerm(''); };
    const closeActiveControl = () => { if (activeControl === 'search') setSearchTerm(''); setActiveControl('none'); };
    if (!list) return <div className="text-center p-10">{t('loading')}</div>; // Should not happen if list data is fetched initially
    const showEmptyListMessage = items.length === 0 && !searchTerm && activeControl !== 'add';
    const showNoSearchResultsMessage = items.length > 0 && filteredAndSortedItems.length === 0 && searchTerm;

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg max-w-2xl mx-auto">
            {/* Header */}
             <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 gap-2">
                 <button onClick={onBack} className="text-primary dark:text-dark-primary flex items-center gap-1 text-sm sm:text-base flex-shrink-0 group"> <span className="material-symbols-rounded text-lg leading-none">arrow_back</span> <span className="group-hover:underline">{t('back_to_lists')}</span> </button>
                 <h2 className="text-xl sm:text-2xl font-semibold text-primary dark:text-dark-primary text-center flex-grow mx-2 truncate" title={list.name}>{list.name}</h2>
                 {isOwner && ( <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                     {/* Share Button */}
                     <button
                         onClick={handleOpenShareClick} // Call the handler that triggers the modal open in App.jsx
                         disabled={!!list.tempId || !isOnline || list.isPublic} // Cannot share offline lists or public lists
                         className={`p-1.5 sm:p-2 rounded-full transition-colors flex items-center justify-center aspect-square ${list.tempId || !isOnline || list.isPublic ? 'opacity-50 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'}`}
                         title={
                             list.tempId ? t('share_unavailable_offline_list') :
                             !isOnline ? t('share_unavailable_offline') :
                             list.isPublic ? t('share_unavailable_public') :
                             t('share_list_button_title')
                         }
                         aria-label={t('share_list_button_title')}
                     >
                         <UserGroupIcon className="h-5 w-5" />
                     </button>
                     {/* Delete Button */}
                     <button onClick={confirmDeleteList} className="p-1.5 sm:p-2 rounded-full transition-colors text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50" title={t('delete_list')} aria-label={t('delete_list')}>
                         <span className="material-symbols-rounded">delete_forever</span>
                     </button>
                  </div> )}
                 {!isOwner && <div className="w-12 sm:w-16 flex-shrink-0"></div>} {/* Placeholder for alignment if not owner */}
             </div>
             {/* Controls */}
             <div ref={controlsAnimationParent} className="flex items-center gap-2 my-3 py-2 border-b border-t border-gray-200 dark:border-gray-700 min-h-[56px]"> <button onClick={() => toggleControl('search')} className={`p-2 rounded-full transition-colors flex-shrink-0 flex items-center justify-center ${activeControl === 'search' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`} aria-label={t(activeControl === 'search' ? 'close_search' : 'open_search')} aria-expanded={activeControl === 'search'}><span className="material-symbols-rounded">search</span></button> <button onClick={() => toggleControl('add')} className={`p-2 rounded-full transition-colors flex-shrink-0 text-white flex items-center justify-center ${activeControl === 'add' ? 'bg-emerald-600 dark:bg-emerald-700 ring-2 ring-emerald-300 ring-offset-1 ring-offset-background dark:ring-offset-dark-background' : 'bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-700'}`} aria-label={t(activeControl === 'add' ? 'close_add_item' : 'open_add_item')} aria-expanded={activeControl === 'add'}><PlusIcon className="h-5 w-5" /></button> {activeControl === 'search' && (<div key="search-c" className="flex items-center flex-grow ml-1 min-w-0"><input ref={searchInputRef} type="search" placeholder={t('search_items_placeholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0 h-10" onKeyDown={(e) => e.key === 'Escape' && closeActiveControl()} aria-label={t('search_items_placeholder')} /></div>)} {activeControl === 'add' && (<div key="add-c" className="flex-grow min-w-0 ml-1"><AddItemInlineForm listId={listId} onAddItem={handleAddItemOnline} onCancel={closeActiveControl} isOnline={isOnline} queueItemAction={queueItemAction} /></div>)} {activeControl === 'none' && (<div key="none-c" className="flex-grow min-h-[40px]"></div>)} </div>
             {/* Item List */}
             {showEmptyListMessage ? ( <p className="text-gray-500 dark:text-gray-400 italic mt-4 text-center">{t('empty_list_message')}</p> ) : showNoSearchResultsMessage ? ( <p className="text-center text-gray-500 dark:text-gray-400 italic mt-4">{t('no_search_results')}</p> ) : (
                <ul ref={listAnimationParent} className="list-none p-0 mb-4">
                    {filteredAndSortedItems.map(item => (
                        <ShoppingListItem
                            key={item._id || item.tempId}
                            item={item}
                            listId={listId} // Pass the list ID down
                            onToggle={handleToggleItemOnline}
                            onDelete={handleDeleteItemOnline}
                            onUpdateComment={onUpdateComment}
                            onUpdateItemQuantity={onUpdateItemQuantity} // <-- Pass down the new prop
                            isOnline={isOnline}
                            queueItemAction={queueItemAction}
                        />
                    ))}
                </ul>
             )}
             {/* Owner Controls */}
             {isOwner && ( <div ref={ownerControlsAnimationParent} className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-6"> <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
                  <div className="flex items-center gap-2 flex-wrap flex-grow mr-2"> <span className={`material-symbols-rounded ${list.isPublic ? 'text-blue-500' : 'text-yellow-600'}`}>{list.isPublic ? 'public' : 'lock'}</span> <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{list.isPublic ? t('list_privacy_public') : t('list_privacy_private')}</span> <span className="text-xs text-gray-500 dark:text-gray-400">({list.isPublic ? t('list_public_info') : t('list_private_info')})</span> </div>
                  <button onClick={() => onTogglePrivacy(listId)} disabled={!isOnline || !!list.tempId} className="px-3 py-1 rounded bg-primary dark:bg-dark-primary text-white text-xs hover:opacity-90 transition-opacity flex items-center gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"> <span className="material-symbols-rounded text-sm">{list.isPublic ? 'lock' : 'public'}</span> {list.isPublic ? t('make_private') : t('make_public')} </button>
             </div> </div> )}
             {/* Share Modal is rendered in App.jsx */}
        </div>
    );
}

export default ShoppingListDetail;