// client/src/hooks/useSync.js
// Description: Custom hook for managing offline pending actions and the sync process.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Import necessary services/utilities
import * as offlineService from '../services/offlineService'; // For local storage queue management
// socket is passed in as a parameter


/**
 * Custom hook for managing offline pending actions queue and sync process.
 *
 * @param {object} params - Parameters passed from the App component.
 * @param {boolean} params.isOnline - App's current online status.
 * @param {boolean} params.isConnected - App's current socket connection status.
 * @param {object} params.socket - The socket.io client instance.
 * @param {Array} params.lists - The current state of shopping lists (needed for initial lookup, though ref is used in loop).
 * @param {Function} params.setLists - Setter for App's lists state (needed for in-loop state updates via handlers).
 * @param {string|null} params.error - App's current general error state.
 * @param {Function} params.setError - Setter for App's general error state.
 * @param {Function} params.fetchLists - Callback from useShoppingListData to refetch list metadata after sync.
 * @param {Function} params.fetchListItems - Callback from useShoppingListData to refetch list items after sync (if in detail view).
 * @param {string} params.currentView - App's current view state.
 * @param {object} params.currentListIdRef - Ref holding the ID of the currently viewed list.
 * @param {Function} params.handleBackToLists - Callback from App to navigate back.
 * @param {Function} params.handleAddItemSuccess - Callback from useShoppingListData to map temp item IDs after addItem success during sync.
 * @param {Array} params.pendingActions - The current state of pending actions from App.
 * @param {Function} params.setPendingActions - Setter for App's pendingActions state.
 * @param {object|null} params.currentUser - The currently authenticated user object.
 * @param {Function} params.applyAndStoreLocally - Helper function from useShoppingListData to apply actions locally.
 */
function useSync({
    isOnline,
    isConnected,
    socket,
    lists,
    setLists,
    error,
    setError,
    fetchLists,
    fetchListItems,
    currentView,
    currentListIdRef,
    handleBackToLists,
    handleAddItemSuccess,
    pendingActions,
    setPendingActions,
    currentUser,
    applyAndStoreLocally,
}) {
    const { t } = useTranslation();

    // State managed by this hook
    const [isSyncingState, setIsSyncingState] = useState(false);
    const [showSyncPromptState, setShowSyncPromptState] = useState(false);

    // Ref to hold the latest stored lists snapshot for the sync loop
    // Initialize with current lists state, and update whenever lists state changes.
    const latestStoredListsRef = useRef(lists || []);

    // Effect to keep the ref updated with the latest lists state
    useEffect(() => {
        latestStoredListsRef.current = lists || [];
    }, [lists]); // Dependency on lists state


    // --- Handler for processing pending actions (Sync) ---
    const handleSyncConfirm = useCallback(async () => {
        const currentPending = offlineService.getPendingActions(); // Get latest queue from storage at start

        if (!isOnline || !isConnected || currentPending.length === 0) {
            console.log(`useSync: Sync skipped. Online: ${isOnline}, Connected: ${isConnected}, Actions: ${currentPending.length}`);
            setShowSyncPromptState(false); // Use internal setter
            !isOnline && setError(t('connection_lost_error'));
            return;
        }

        console.log(`useSync: Starting sync process for ${currentPending.length} actions...`);
        setShowSyncPromptState(false); // Use internal setter immediately
        setIsSyncingState(true); // Use internal setter
        setError(t('syncing_changes'));

        let syncErrorOccurred = false;
        const actionsToProcess = [...currentPending]; // Process a copy


        try {
            // Update the snapshot lists *in the ref* just before starting the loop
            // to ensure the loop uses the most recent state including any changes
            // made by socket events or earlier sync loop iterations.
            latestStoredListsRef.current = offlineService.getStoredLists() || [];
            const snapshotLists = latestStoredListsRef.current; // Use this snapshot within the loop


            for (const action of actionsToProcess) {
                await new Promise(resolve => setTimeout(resolve, 50));

                if (!socket.connected) {
                    syncErrorOccurred = true; setError(t('connection_lost_error')); console.error("useSync: Sync aborted: Socket disconnected during loop."); break;
                }

                console.log(`useSync: Sync processing action ID: ${action.id}, Type: ${action.type}, Payload:`, action.payload);

                try {
                    let emitPayload = { ...action.payload };
                    let eventName = action.type;
                    let shouldEmit = true;

                    // --- Resolve List/Item IDs using the snapshot lists ---
                    // Find the relevant list/item in the *snapshot* copy obtained before the loop iteration.
                    const listInSnapshot = action.payload.listId ? snapshotLists.find(l => l._id === action.payload.listId || l.tempId === action.payload.listId) : null;
                    const itemInSnapshot = (listInSnapshot && action.payload.itemId) ? (listInSnapshot.items || []).find(i => i._id === action.payload.itemId || i.tempId === action.payload.itemId) : null;

                    const serverListId = listInSnapshot?._id;
                    const serverItemId = itemInSnapshot?._id;
                    const isTempListSnapshot = listInSnapshot?.tempId && !listInSnapshot?._id;
                    const isTempItemSnapshot = itemInSnapshot?.tempId && !itemInSnapshot?._id;


                    switch (eventName) {
                         case 'addList':
                              // If the list is now synced in the snapshot (meaning it was mapped during this sync loop or by event)
                              // check if the action payload's tempId matches the tempId of the list in the snapshot.
                              if (serverListId && listInSnapshot?.tempId === action.payload.tempId) {
                                  console.log(`useSync: addList action ${action.id}: List now synced (${serverListId}). Skipping emit.`);
                                   shouldEmit = false;
                              } else if (!listInSnapshot) { // List not found in snapshot
                                  console.warn(`useSync: addList action ${action.id}: List with temp ID ${action.payload.tempId} not found in snapshot. Skipping emit.`);
                                  shouldEmit = false;
                              } else { // List is still temp in snapshot
                                  emitPayload = { name: action.payload.name, isPublic: action.payload.isPublic, tempId: action.payload.tempId };
                              }
                              break;

                        case 'deleteList':
                             // If the action payload had a temp ID, it's an offline-only list handled locally.
                             // If list not found in snapshot by its ID, it was already deleted.
                             if (!action.payload.listId || action.payload.listId.startsWith('temp_') || !listInSnapshot) {
                                console.log(`useSync: ${eventName} action ${action.id}: Action payload for temp list or list not found in snapshot. Skipping emit.`);
                                shouldEmit = false;
                            } else if (!serverListId) { // List in snapshot but no server ID? (Shouldn't happen for a non-temp delete action payload)
                                console.warn(`useSync: ${eventName} action ${action.id}: List ${action.payload.listId} found in snapshot but has no server ID. Skipping emit.`);
                                shouldEmit = false;
                            } else { // List found in snapshot and has server ID
                                emitPayload = serverListId;
                                eventName = 'deleteList';
                            }
                            break;

                        case 'toggleListPrivacy':
                        case 'updateListAllowedUsers':
                            // Cannot sync if list is temp in snapshot, missing server ID, or not found.
                             if (!listInSnapshot || !serverListId || isTempListSnapshot) {
                                console.log(`useSync: ${eventName} action ${action.id}: List ${action.payload.listId} is temp/missing server ID/not found in snapshot. Skipping emit.`);
                                shouldEmit = false;
                             } else { // List found in snapshot and has server ID
                                emitPayload = eventName === 'toggleListPrivacy' ? serverListId : { listId: serverListId, allowedUserIds: action.payload.allowedUserIds };
                             }
                            break;

                        case 'addItem':
                            // Find item in snapshot by its tempItemId from the action payload
                            const itemInSnapshotByTempId = action.payload.tempItemId ? (listInSnapshot?.items || []).find(i => i.tempId === action.payload.tempItemId) : null;

                             // Cannot sync if list is temp in snapshot, missing server ID, or item not found in snapshot by temp ID or already synced.
                            if (!listInSnapshot || !serverListId || isTempListSnapshot || !itemInSnapshotByTempId || itemInSnapshotByTempId._id) {
                                 console.log(`useSync: ${eventName} action ${action.id}: List ${action.payload.listId} temp/missing server ID/not found, or Item ${action.payload.tempItemId || action.payload.itemId} not found by temp ID/already synced in snapshot. Cannot sync item. Skipping emit.`);
                                 shouldEmit = false;
                            } else { // List synced, item is temp in snapshot
                                emitPayload = { listId: serverListId, itemName: action.payload.itemName, tempItemId: action.payload.tempItemId };
                            }
                             break;


                        case 'deleteItem':
                        case 'toggleItem':
                        case 'updateItemComment':
                        case 'updateItemQuantity':
                             // Cannot sync if list or item is temp in snapshot, missing server IDs, or not found.
                             if (!listInSnapshot || !serverListId || isTempListSnapshot || !itemInSnapshot || !serverItemId || isTempItemSnapshot) {
                                 console.log(`useSync: ${eventName} action ${action.id}: List ${action.payload.listId} or Item ${action.payload.itemId} is temp/missing server ID/not found in snapshot. Skipping emit.`);
                                 shouldEmit = false;
                             } else { // List and item found in snapshot and have server IDs
                                emitPayload = { listId: serverListId, itemId: serverItemId };
                                 if (eventName === 'toggleItem') emitPayload.completed = action.payload.completed;
                                 if (eventName === 'updateItemComment') emitPayload.comment = action.payload.comment;
                                 if (eventName === 'updateItemQuantity') { emitPayload.quantityValue = action.payload.quantityValue; emitPayload.quantityUnit = action.payload.quantityUnit; }
                             }
                            break;

                        default:
                            console.warn(`useSync: Unknown action type during sync: ${eventName} for action ${action.id}. Skipping.`);
                            shouldEmit = false;
                            break;
                    }

                    if (shouldEmit) {
                        console.log(`useSync: Attempting to emit ${eventName} for action ${action.id} with payload:`, emitPayload);
                         const response = await new Promise((resolveEmit, rejectEmit) => {
                              socket.emit(eventName, emitPayload, (res) => {
                                  res?.error ? rejectEmit({ message: res.error, code: res.code, action }) : resolveEmit(res);
                              });
                              setTimeout(() => rejectEmit({ message: `Sync ${eventName} emit timeout`, action }), 15000);
                         });

                         console.log(`useSync: ${eventName} action ${action.id} successful. Response:`, response);

                         if (eventName === 'addItem' && response?.item?._id && response.item.tempId) {
                              console.log(`useSync: addItem successful, mapping temp item ID ${response.item.tempId} to ${response.item._id}`);
                             // Call handler from useShoppingListData to update state and storage
                             handleAddItemSuccess(response.item, response.item.tempId);
                             // *** Update the snapshot lists *in the ref* after a successful addItem ***
                             // This is crucial so subsequent actions in the *same sync batch* that target this item
                             // (e.g., toggleItem on the newly added item) use the correct *real* item ID from the updated snapshot.
                             latestStoredListsRef.current = offlineService.getStoredLists() || []; // Re-snapshot after state update
                         }
                         // For other actions (delete, toggle, update), their effects on state
                         // are handled by socket listeners or the final fetch, so updating the snapshot here isn't strictly necessary
                         // unless a subsequent action in the *same sync batch* relies on the state change
                         // (e.g., deleting an item added earlier in the same batch). Updating the snapshot
                         // after any state-modifying action handler is safer.
                         if (eventName !== 'addItem') { // Update snapshot after any action that might change list/item IDs or properties
                             latestStoredListsRef.current = offlineService.getStoredLists() || [];
                         }

                    } else {
                        console.log(`useSync: Action ${action.id} (${action.type}) skipped based on state/type. Not emitted.`);
                    }


                } catch (err) {
                    console.error(`useSync: Sync error for action ${err.action?.id} (${err.action?.type || 'Unknown'}):`, err.message, err.code ? `(Code: ${err.code})` : '');
                    syncErrorOccurred = true;

                    const baseError = t('sync_failed_action', { action: err.action?.type || 'Unknown' });
                    const codeDetails = err.code ? ` (Code: ${err.code})` : '';
                    const messageDetails = err.message ? ` - ${err.message}` : '';
                    setError(`${baseError}${messageDetails}${codeDetails}`);

                    break;
                }
            } // End of action loop
        } catch (outerError) {
            console.error("useSync: Critical error during sync process:", outerError);
            syncErrorOccurred = true;
            setError(t('sync_failed') + ' (Critical Process Error)');
        } finally {
            console.log(`useSync: Sync process loop finished.`);

             const latestPending = offlineService.getPendingActions();
            console.log(`useSync: Latest pending actions after sync loop: ${latestPending.length}`);

             setPendingActions(latestPending); // Use setter provided by App


            console.log("useSync: Sync process ended. Fetching latest data to reconcile state...");
            fetchLists(true);

            if (currentView === 'detail' && currentListIdRef.current) {
                 console.log(`useSync: Sync ended, currently in list detail view ${currentListIdRef.current}. Re-fetching items.`);
                 setTimeout(() => { fetchListItems(currentListIdRef.current); }, 500);
             }


             if (!syncErrorOccurred && latestPending.length === 0) {
                 console.log("useSync: Sync completed successfully. All pending actions processed.");
                 setError(t('sync_complete'));
                 setTimeout(() => setError(null), 3000);
             } else if (syncErrorOccurred) {
                 console.log("useSync: Sync failed or was interrupted.");
             } else {
                 console.log(`useSync: Sync finished, but ${latestPending.length} actions remain pending.`);
                 setError(t('sync_partially_complete', { count: latestPending.length }));
                 setTimeout(() => setError(null), 4000);
             }

            setIsSyncingState(false);
        }
    }, [isOnline, isConnected, socket, lists, setLists, error, setError, fetchLists, fetchListItems, currentView, currentListIdRef, t, handleAddItemSuccess, pendingActions, setPendingActions, currentUser, applyAndStoreLocally, setIsSyncingState]);


    // --- Handler for cancelling the sync prompt ---
    const handleSyncCancel = useCallback(() => {
        console.log("useSync: Sync prompt cancelled.");
        setShowSyncPromptState(false);

         if (error === t('syncing_changes') || error?.includes(t('sync_failed')) || error?.includes(t('sync_partially_complete'))) {
              setError(null);
         }
    }, [error, t, setShowSyncPromptState, setError]);


    // --- Socket Event Listener for Server Confirmation ---
     const handleActionCompletedByServer = useCallback((data) => {
         console.log("useSync: Socket event: listActionCompleted", data);
         if (!data || !data.actionId) {
             console.warn("useSync: listActionCompleted event received invalid data:", data);
             return;
         }
         setPendingActions(currentPending => {
              const updatedPending = (currentPending || []).filter(action => action.id !== data.actionId);
              offlineService.storePendingActions(updatedPending);
             return updatedPending;
         });
          setError(null);

          if (data.actionType === 'addItem' && data.tempItemId && data.serverItem) {
               console.log(`useSync: Received addItem completion for temp ID ${data.tempItemId} with server item ID ${data.serverItem._id}.`);
              handleAddItemSuccess(data.serverItem, data.tempItemId);
               // After mapping, update the snapshot lists ref
              latestStoredListsRef.current = offlineService.getStoredLists() || [];
          }

     }, [setPendingActions, setError, handleAddItemSuccess, latestStoredListsRef]);


    // --- Effect to trigger sync prompt conditions ---
     useEffect(() => {
          console.log(`useSync: Pending actions effect: Actions=${pendingActions.length}, Online=${isOnline}, Connected=${isConnected}, Syncing=${isSyncingState}, Prompting=${showSyncPromptState}, View=${currentView}`);
         if (pendingActions.length > 0 && isOnline && isConnected && !isSyncingState && !showSyncPromptState && currentUser && currentView !== 'login' && currentView !== 'loading' && currentView !== 'admin' && currentView !== 'adminLogs') {
              console.log(`useSync: Conditions met for sync prompt (${pendingActions.length} actions). Showing prompt.`);
              setShowSyncPromptState(true);
         } else if (
             (!isOnline || !isConnected || isSyncingState || !currentUser || currentView === 'login' || currentView === 'loading' || currentView === 'admin' || currentView === 'adminLogs')
             && showSyncPromptState
             ) {
              console.log("useSync: Conditions not met for sync prompt. Hiding prompt.");
             setShowSyncPromptState(false);
         }
     }, [pendingActions, isOnline, isConnected, isSyncingState, showSyncPromptState, currentView, currentUser, setShowSyncPromptState]);


    // Return the state and handler functions that the App component needs to use.
    return {
        isSyncing: isSyncingState,
        showSyncPrompt: showSyncPromptState,
        setShowSyncPrompt: setShowSyncPromptState,

        handleSyncConfirm,
        handleSyncCancel,
        handleActionCompletedByServer,
    };
}

export default useSync;