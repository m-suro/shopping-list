// client/src/hooks/useShoppingListData.js
// Description: Custom hook for managing shopping list and item data and actions.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Import necessary services/utilities
import * as offlineService from '../services/offlineService'; // For local storage and optimistic apply
import { socket } from '../socket'; // For interacting with the server via websockets


// Get the API URL from environment variables (needed for fetch calls)
const API_URL = import.meta.env.VITE_SERVER_URL;


/**
 * Custom hook for managing shopping list and item data, including fetching,
 * creating, updating, deleting, and handling offline changes/sync queuing.
 *
 * @param {object} params - Parameters passed from the App component.
 * @param {object|null} params.currentUser - The currently authenticated user object.
 * @param {boolean} params.isOnline - App's current online status.
 * @param {boolean} params.isConnected - App's current socket connection status.
 * @param {boolean} params.isSyncing - App's current syncing status (to avoid conflicting fetches).
 * @param {boolean} params.isLoading - App's current general loading status. (ADDED)
 * @param {Function} params.setError - Setter for App's general error state.
 * @param {Function} params.setPendingActions - Setter for App's pendingActions state (managed by useSync).
 * @param {Function} params.setIsLoading - Setter for App's general loading state (e.g., for item fetch).
 * @param {Function} params.setCurrentView - Setter for App's currentView state.
 * @param {Function} params.handleBackToLists - Callback from App to navigate back.
 * @param {object} params.socket - The socket.io client instance.
 * @param {Array} params.lists - The current state of shopping lists (needed for internal logic like finding lists/items).
 * @param {Function} params.setLists - Setter for App's lists state (needed for optimistic updates and fetch results).
 * @param {string|null} params.currentListId - The current list ID state from App.
 * @param {Function} params.setCurrentListId - Setter for App's currentListId state.
 */
function useShoppingListData({
    currentUser,
    isOnline,
    isConnected,
    isSyncing,
    isLoading, // ACCEPTED AS PARAMETER
    setError,
    setPendingActions,
    setIsLoading,
    setCurrentView,
    handleBackToLists,
    socket,
    lists, // Accept lists state from App
    setLists, // Accept setLists setter from App
    currentListId, // Accept currentListId from App
    setCurrentListId // Accept setCurrentListId from App
}) {
    const { t } = useTranslation();

    // Lists and currentListId are now managed by App and passed in.


    // Ref to hold the current list ID for use inside effects/callbacks without needing it as a dependency
    const currentListIdRef = useRef(currentListId);
    useEffect(() => { currentListIdRef.current = currentListId; }, [currentListId]);


    // --- Helper to Apply Action Locally and Store ---
     const applyAndStoreLocally = useCallback((action) => {
         console.log("useShoppingListData: Applying action locally:", action);
          setLists(currentLists => { // Use setter provided by App
              const newListsState = offlineService.applyActionLocally(currentLists || [], action);
               offlineService.storeLists(newListsState);
              return newListsState;
          });
     }, [setLists]);


     // --- Helper to Map Temp Item IDs ---
     const handleAddItemSuccess = useCallback((serverItem, tempItemId) => {
        console.log(`useShoppingListData: Mapping temp item ID ${tempItemId} to server ID ${serverItem._id} for list ${serverItem.listId}`);
        setLists(currentLists => { // Use setter provided by App
            const updatedLists = (currentLists || []).map(list => {
                 if (list._id === serverItem.listId || (list.tempId === serverItem.listId && !list._id)) {
                     let itemMapped = false;
                     const updatedItems = (list.items || []).map(item => {
                         if (item.tempId === tempItemId) {
                            itemMapped = true;
                             return { ...serverItem, isOffline: false, tempId: undefined };
                         }
                         return item;
                     });
                     !itemMapped && !updatedItems.some(i => i._id === serverItem._id) && (console.warn(`useShoppingListData: Temp item ${tempItemId} not found to map in list ${list._id || list.tempId}. Adding server item ${serverItem._id} directly.`), updatedItems.push({ ...serverItem, isOffline: false, tempId: undefined }));

                    const uniqueItems = Array.from(new Map(updatedItems.map(item => [item._id || item.tempId, item])).values());
                     return { ...list, items: uniqueItems, isOffline: false };
                 }
                 return list;
            });
            offlineService.storeLists(updatedLists);
            return updatedLists;
        });
    }, [setLists]);


    // --- Fetch Handlers ---

    // fetchLists: Fetches list metadata (WITHOUT ITEMS) from the server.
    const fetchLists = useCallback(async (calledDuringSync = false) => {
        if (!currentUser || !API_URL) { console.log("useShoppingListData: FetchLists skipped: no user or API_URL."); return; }
        if (!isConnected && !calledDuringSync) { console.log("useShoppingListData: FetchLists skipped: not connected (and not called during sync)."); return; }
        // Read isLoading and isSyncing states passed as props
        if ((isLoading || isSyncing) && !calledDuringSync) { console.log(`useShoppingListData: FetchLists skipped: isLoading=${isLoading}, isSyncing=${isSyncing}, calledDuringSync=${calledDuringSync}`); return; }

        console.log("useShoppingListData: Fetching list metadata (without items) from server...");

        try {
            console.log("useShoppingListData: fetchLists: Sending GET request to /api/lists");
            const res = await fetch(`${API_URL}/api/lists`, { credentials: 'include' });
             console.log(`useShoppingListData: fetchLists: Received response status: ${res.status}`);

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 401) {
                    console.error("useShoppingListData: fetchLists failed (401): Session likely expired.");
                     setError(t('session_expired'));
                } else {
                    console.error(`useShoppingListData: fetchLists failed with status ${res.status}: ${data.message}`);
                    setError(data.message || t('error_fetching_lists'));
                }
                return;
            }
            const serverLists = await res.json();
             console.log(`useShoppingListData: fetchLists: Received ${serverLists.length} lists.`);

            const cleanServerLists = (Array.isArray(serverLists) ? serverLists : []).map(serverList => ({
                ...serverList,
                isOffline: false,
                 // Preserve items from state passed as prop
                items: (Array.isArray(lists) ? lists.find(l => l._id === serverList._id)?.items : null) || (Array.isArray(serverList.items) ? serverList.items.map(item => ({ ...item, isOffline: false })) : []),
            }));

            setLists(currentLists => { // Use setter provided by App
                 const safeCurrentLists = currentLists || [];
                 const currentListMap = new Map(safeCurrentLists.map(l => [l._id || l.tempId, l]));
                 const serverListMap = new Map(cleanServerLists.map(l => [l._id, l]));

                 const mergedLists = cleanServerLists.map(fetchedList => {
                     const existingList = currentListMap.get(fetchedList._id);
                      const itemsToUse = (existingList && Array.isArray(existingList.items) && existingList.items.length > 0) ? existingList.items : fetchedList.items;
                      return { ...fetchedList, items: itemsToUse };
                 });

                 safeCurrentLists.forEach(localList => {
                     if (localList.tempId && !localList._id && !serverListMap.has(localList._id) && !mergedLists.some(l => l.tempId === localList.tempId)) {
                          console.log("useShoppingListData: Merging local-only temp list:", localList.tempId);
                         mergedLists.push(localList);
                     }
                 });

                 const uniqueLists = Array.from(new Map(mergedLists.map(list => [list._id || list.tempId, list])).values());

                 offlineService.storeLists(uniqueLists);
                 return uniqueLists;
            });

            console.log("useShoppingListData: fetchLists: List metadata fetched and state updated.");
            setError(null);

        } catch (err) {
            console.error("useShoppingListData: fetchLists caught error:", err);
            setError(err.message || t('error_fetching_lists_generic'));
        }
    }, [API_URL, currentUser, isSyncing, isLoading, t, isConnected, setLists, setError, lists]); // ADDED isLoading dependency

    // fetchListItems: Fetches items for a specific list from the server.
     const fetchListItems = useCallback(async (listId) => {
         if (!currentUser || !API_URL || !listId) { console.log("useShoppingListData: FetchListItems skipped: no user, API_URL, or listId."); return; }

        setIsLoading(true);
        setError(null);

        const listInState = lists.find(l => l._id === listId || l.tempId === listId);

        if (!listInState) {
             console.warn(`useShoppingListData: FetchListItems skipped for ${listId}: List not found in state.`);
             setError(t('list_not_found_or_deleted'));
             currentListIdRef.current === listId && setTimeout(handleBackToLists, 100);
             setIsLoading(false);
             return;
        }

        if (!isOnline || !isConnected || (listInState.tempId && !listInState._id)) {
            console.log(`useShoppingListData: FetchListItems for ${listId}: Offline or offline-only list. Loading from local storage.`);
            const storedLists = offlineService.getStoredLists();
            const localList = storedLists.find(l => l._id === listId || l.tempId === listId);

            if (localList && Array.isArray(localList.items)) {
                 console.log(`useShoppingListData: Loaded ${localList.items.length} items for ${listId} from local storage.`);
                 setLists(currentLists => { // Use setter provided by App
                     const updatedLists = (currentLists || []).map(list =>
                         list._id === listId || list.tempId === listId ? { ...list, items: localList.items } : list
                     );
                     return updatedLists;
                 });
                setError(t('status_offline_mode'));
            } else {
                 console.log(`useShoppingListData: List ${listId} not found in local storage with items. Showing empty.`);
                 setLists(currentLists => { // Use setter provided by App
                      const updatedLists = (currentLists || []).map(list =>
                           list._id === listId || list.tempId === listId ? { ...list, items: [] } : list
                       );
                      return updatedLists;
                 });
                 setError(t('offline_no_items_cached'));
            }
            setIsLoading(false);
             return;
        }

         console.log(`useShoppingListData: Fetching items for list ${listId} from server...`);

         try {
             console.log(`useShoppingListData: fetchListItems: Sending GET request to /api/lists/${listId}/items`);
             const res = await fetch(`${API_URL}/api/lists/${listId}/items`, { credentials: 'include' });
             console.log(`useShoppingListData: fetchListItems: Received response status for ${listId}: ${res.status}`);

             if (!res.ok) {
                 const data = await res.json().catch(() => ({}));
                 if (res.status === 403 || res.status === 404) {
                     console.warn(`useShoppingListData: fetchListItems failed (${res.status}): Access denied or list not found for items fetch ${listId}.`);
                     setError(data.message || t('list_not_found_or_access_denied'));
                     currentListIdRef.current === listId && setTimeout(handleBackToLists, 1000);
                 } else if (res.status === 401) {
                     console.error("useShoppingListData: fetchListItems failed (401): Session likely expired.");
                      setError(t('session_expired'));
                 } else {
                      console.error(`useShoppingListData: fetchListItems failed with status ${res.status}: ${data.message}`);
                      setError(data.message || t('error_fetching_items'));
                 }
             } else {
                 const serverItems = await res.json();
                  console.log(`useShoppingListData: fetchListItems: Received ${serverItems.length} items for list ${listId}.`);
                 const cleanServerItems = (Array.isArray(serverItems) ? serverItems : []).map(item => ({ ...item, isOffline: false }));

                 setLists(currentLists => { // Use setter provided by App
                      const updatedLists = (currentLists || []).map(list =>
                           list._id === listId ? { ...list, items: cleanServerItems, isOffline: false } : list
                      );
                       offlineService.storeLists(updatedLists);
                      return updatedLists;
                 });

                 console.log(`useShoppingListData: Items fetched successfully for list ${listId}.`);
                 setError(null);
             }


         } catch (err) {
             console.error(`useShoppingListData: fetchListItems caught error for list ${listId}:`, err);
              setError(err.message || t('error_fetching_items_generic'));
         } finally {
             setIsLoading(false);
              console.log(`useShoppingListData: fetchListItems finished for list ${listId}.`);
         }
     }, [API_URL, currentUser, isOnline, isConnected, lists, t, handleBackToLists, setLists, setError, setIsLoading, currentListIdRef]); // Added currentListIdRef dependency


    // --- Navigation Handler ---

    // handleSelectList: Handles the user selecting a specific list to view its items.
     const handleSelectList = useCallback(async (listId) => {
        if (!currentUser || !listId) { console.warn("useShoppingListData: Select list skipped: No user or list ID."); return; }

        const listInState = lists.find(list => list._id === listId) || lists.find(list => list.tempId === listId);

        if (!listInState) {
             console.warn(`useShoppingListData: Select list skipped: List ${listId} not found in state.`);
             setError(t('list_not_found_or_deleted'));
             return;
        }

        console.log(`useShoppingListData: Selecting list: ${listId} (Name: ${listInState.name})`);

        setCurrentListId(listId); // Use setter provided by App
        setCurrentView('detail'); // Use setter provided by App
        setError(null);

        const serverListId = listInState._id;
        if (isOnline && isConnected && serverListId) {
            console.log(`useShoppingListData: Joining list room: ${serverListId}`);
            socket.emit('joinList', serverListId);
        } else {
             console.log(`useShoppingListData: Skipping join room for list ${listId}: Online=${isOnline}, Connected=${isConnected}, ServerId=${serverListId}`);
        }

        fetchListItems(listId);

    }, [currentUser, lists, isOnline, isConnected, socket, t, fetchListItems, setCurrentListId, setCurrentView, setError]); // Added setters passed from App


    // --- Action Handlers (List & Item) ---

     // handleAddList: Adds a new list optimistically and syncs via socket/queue.
    const handleAddList = useCallback((name, isPublic) => {
        if (!currentUser) { console.warn("useShoppingListData: Add list skipped: No user."); return; }

        const listName = name || t('default_list_name');
        const tempListId = `temp_${crypto.randomUUID()}`;
        const optimisticList = {
            _id: tempListId, tempId: tempListId, name: listName, isPublic: !!isPublic, items: [],
            owner: { _id: currentUser._id, username: currentUser.username }, allowedUsers: [],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOffline: true
        };

        const action = { type: 'addList', payload: { ...optimisticList } };

        applyAndStoreLocally(action);
        setError(null);

        const syncPayload = { name: listName, isPublic: !!isPublic, tempId: tempListId };

        if (isOnline && isConnected) {
            console.log("useShoppingListData: Online, emitting addList:", syncPayload);
            socket.emit('addList', syncPayload, (res) => {
                if (res?.error) {
                    setError(t('error_adding_list', { message: res.error }));
                    console.error("useShoppingListData: Server error adding list:", res.error);
                     setLists(prev => { // Use setter provided by App
                          const listsAfterRevert = (prev || []).filter(l => l._id !== tempListId && l.tempId !== tempListId);
                          offlineService.storeLists(listsAfterRevert);
                          return listsAfterRevert;
                     });
                } else if (res?.newList) {
                    console.log("useShoppingListData: List added successfully via socket. State updated by event/sync.");
                     setError(null);
                } else {
                     console.warn("useShoppingListData: addList socket emit successful but response format unexpected:", res);
                     setError(t('error_adding_list_generic'));
                }
            });
        } else {
            console.log("useShoppingListData: Offline, queueing addList action.");
            const syncAction = { type: 'addList', payload: syncPayload, id: crypto.randomUUID() };
            const updatedQueue = offlineService.addPendingAction(syncAction);
            offlineService.storePendingActions(updatedQueue);
            setPendingActions(updatedQueue); // Use setter provided by App
             setError(null);
        }
    }, [currentUser, isOnline, isConnected, socket, t, applyAndStoreLocally, setLists, setPendingActions, setError]);


     // handleDeleteList: Deletes a list optimistically and syncs via socket/queue.
    const handleDeleteList = useCallback((listId) => {
        if (!currentUser) { console.warn("useShoppingListData: Delete list skipped: No user."); return; }
        const safeLists = lists || [];
        const listToDelete = safeLists.find(l => l._id === listId || l.tempId === listId);
        if (!listToDelete) { console.warn(`useShoppingListData: Delete list skipped: List ${listId} not found.`); setError(t('list_not_found_or_deleted')); return; }

        const originalListToDelete = {...listToDelete};

        const effectiveListId = listToDelete._id || listToDelete.tempId;
        const serverId = listToDelete._id;
        const isTemp = !!listToDelete.tempId && !listToDelete._id;

        const action = { type: 'deleteList', payload: { listId: effectiveListId } };

        applyAndStoreLocally(action);
        setError(null);

        currentListIdRef.current === effectiveListId && (console.log(`useShoppingListData: Currently viewing list ${effectiveListId}, navigating back after delete.`), handleBackToLists());

        const syncPayload = { listId: serverId || effectiveListId };

        if (isOnline && isConnected && !isTemp && serverId) {
            console.log(`useShoppingListData: Online, emitting deleteList for server ID: ${serverId}`);
            socket.emit('deleteList', serverId, (res) => {
                if (res?.error) {
                    setError(t('error_deleting_list', { message: res.error }));
                    console.error(`useShoppingListData: Server error deleting list ${serverId}:`, res.error);
                     setLists(prev => { // Use setter provided by App
                        if (!prev?.some(l => l._id === originalListToDelete._id || l.tempId === originalListToDelete.tempId) && originalListToDelete) {
                            console.log(`useShoppingListData: Reverting optimistic delete for list ${effectiveListId}`);
                            const listsAfterRevert = [...(prev || []), originalListToDelete];
                            offlineService.storeLists(listsAfterRevert);
                            return listsAfterRevert;
                        }
                        return prev || [];
                     });
                } else {
                    console.log(`useShoppingListData: List ${serverId} deleted successfully on server.`);
                    setError(null);
                }
            });
        } else if (!isTemp) {
             console.log(`useShoppingListData: Offline, queueing deleteList action for ${effectiveListId}.`);
             const syncAction = { type: 'deleteList', payload: syncPayload, id: crypto.randomUUID() };
             const updatedQueue = offlineService.addPendingAction(syncAction);
             offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
        } else {
             console.log(`useShoppingListData: Offline delete of offline-only list ${effectiveListId}. No queue needed.`);
             setError(null);
        }
    }, [currentUser, lists, isOnline, isConnected, socket, t, applyAndStoreLocally, setLists, setPendingActions, setError, handleBackToLists, currentListIdRef]);


     // handleTogglePrivacy: Toggles list privacy optimistically and syncs via socket/queue.
    const handleTogglePrivacy = useCallback((listId) => {
         if (!currentUser || !listId) { console.warn("useShoppingListData: Toggle privacy skipped: No user or list ID."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Toggle privacy skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         if (listInState.owner?._id !== currentUser?._id) { console.warn(`useShoppingListData: Toggle privacy skipped: User ${currentUser?._id} is not owner of list ${listId}.`); setError(t('list_privacy_not_owner')); return; }
         if (listInState.tempId && !listInState._id) { console.warn(`useShoppingListData: Toggle privacy skipped: List ${listId} is offline-only and not synced.`); setError(t('list_privacy_offline_only')); return; }

         const effectiveListId = listInState._id;
         const newIsPublic = !listInState.isPublic;

         const action = { type: 'toggleListPrivacy', payload: { listId: effectiveListId, isPublic: newIsPublic } };

         applyAndStoreLocally(action);
         setError(null);

         const syncPayload = { listId: effectiveListId, isPublic: newIsPublic };

         if (isOnline && isConnected && effectiveListId) {
              console.log("useShoppingListData: Online, emitting toggleListPrivacy:", syncPayload);
              socket.emit('toggleListPrivacy', syncPayload, (res) => {
                  if (res?.error) {
                      setError(t('error_toggling_privacy', { message: res.error }));
                      console.error("useShoppingListData: Server error toggling privacy online:", res.error);
                  } else {
                       console.log(`useShoppingListData: Privacy toggled online successfully for ${effectiveListId}.`);
                       setError(null);
                  }
              });
         } else {
              console.log(`useShoppingListData: Offline or list ${effectiveListId} not synced, queueing toggleListPrivacy action.`);
              const syncAction = { type: 'toggleListPrivacy', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
              setPendingActions(updatedQueue); // Use setter provided by App
               setError(null);
         }
     }, [currentUser, lists, isOnline, isConnected, socket, t, applyAndStoreLocally, setLists, setPendingActions, setError]);


    // handleUpdateListAllowedUsers: Updates allowed users for a list locally and via socket/queue.
     const handleUpdateListAllowedUsers = useCallback((listId, newAllowedUserIds) => {
         if (!currentUser || !listId || !Array.isArray(newAllowedUserIds)) { console.warn("useShoppingListData: Update allowed users skipped: No user, listId, or invalid newAllowedUserIds."); setError(t('action_skipped')); return; }

        const currentList = lists.find(l => l._id === listId || l.tempId === listId);
        if (!currentList) { console.warn(`useShoppingListData: Update allowed users skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         if (currentList.owner?._id !== currentUser?._id) { console.warn(`useShoppingListData: Update allowed users skipped: User ${currentUser?._id} is not owner of list ${listId}.`); setError(t('list_sharing_not_owner')); return; }
         if (currentList.tempId && !currentList._id) { console.warn(`useShoppingListData: Update allowed users skipped: List ${listId} is offline-only and not synced.`); setError(t('list_sharing_offline_only')); return; }


        const effectiveListId = currentList._id;

        const action = { type: 'updateListAllowedUsers', payload: { listId: effectiveListId, allowedUserIds: newAllowedUserIds } };

         applyAndStoreLocally(action);
         setError(null);

         const syncPayload = { listId: effectiveListId, allowedUserIds: newAllowedUserIds };


         if (isOnline && isConnected && effectiveListId) {
             console.log(`useShoppingListData: Online, emitting updateListAllowedUsers for list ${effectiveListId}:`, syncPayload);
             socket.emit('updateListAllowedUsers', syncPayload, (res) => {
                 if (res?.error) {
                     setError(t('error_updating_list_sharing', { message: res.error }));
                     console.error("useShoppingListData: Server error updating list sharing:", res.error);
                 } else {
                      console.log(`useShoppingListData: List ${listId} sharing updated successfully on server.`);
                       setError(null);
                 }
             });
         } else {
             console.log(`useShoppingListData: Offline or list ${effectiveListId} not synced, queueing updateListAllowedUsers action.`);
             const syncAction = { type: 'updateListAllowedUsers', payload: syncPayload, id: crypto.randomUUID() };
             const updatedQueue = offlineService.addPendingAction(syncAction);
             offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }

         // Close modal after attempting to save/queue (assuming modal state is in App)
     }, [currentUser, isOnline, isConnected, socket, t, lists, applyAndStoreLocally, setLists, setPendingActions, setError]);

     // handleAddItem: Adds an item optimistically and syncs via socket/queue.
    const handleAddItem = useCallback((listId, itemName) => {
         if (!currentUser || !listId || !itemName) { console.warn("useShoppingListData: Add item skipped: Missing user, list ID, or item name."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Add item skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }

        const effectiveListId = listInState._id || listInState.tempId;
         const serverListId = listInState._id;
         const tempItemId = `temp_${crypto.randomUUID()}`;

        const optimisticItem = {
            _id: tempItemId, tempId: tempItemId, name: itemName.trim(), quantityValue: 1, quantityUnit: '', comment: '', completed: false,
            listId: effectiveListId,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOffline: true
        };

         const action = { type: 'addItem', payload: { listId: effectiveListId, item: optimisticItem } };

         applyAndStoreLocally(action);
         setError(null);

         const syncPayload = { listId: serverListId || effectiveListId, itemName: itemName.trim(), tempItemId: tempItemId };


         if (isOnline && isConnected && serverListId) {
              console.log(`useShoppingListData: Online, emitting addItem to list ${serverListId}:`, syncPayload);
             socket.emit('addItem', syncPayload, (res) => {
                  if (res?.error) {
                      setError(t('error_adding_item', { message: res.error }));
                      console.error("useShoppingListData: Server error adding item:", res.error);
                  } else if (res?.item?._id && res.item.tempId) {
                       console.log("useShoppingListData: Item added successfully via socket.");
                       handleAddItemSuccess(res.item, res.item.tempId);
                       setError(null);
                  } else {
                       console.warn("useShoppingListData: addItem socket emit successful but response format unexpected:", res);
                       setError(t('error_adding_item_generic'));
                  }
             });
         } else {
              console.log(`useShoppingListData: Offline or list ${effectiveListId} not synced, queueing addItem action.`);
              const syncAction = { type: 'addItem', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }
     }, [currentUser, lists, isOnline, isConnected, socket, t, setError, applyAndStoreLocally, setLists, setPendingActions, handleAddItemSuccess]);


    // handleDeleteItem: Deletes an item optimistically and syncs via socket/queue.
    const handleDeleteItem = useCallback((listId, itemId) => {
         if (!currentUser || !listId || !itemId) { console.warn("useShoppingListData: Delete item skipped: Missing user, list ID, or item ID."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Delete item skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         const itemToDelete = (listInState.items || []).find(i => i._id === itemId || i.tempId === itemId);
         if (!itemToDelete) { console.warn(`useShoppingListData: Delete item skipped: Item ${itemId} not found in list ${listId}.`); setError(t('item_not_found_or_deleted')); return; }

        const effectiveListId = listInState._id || listInState.tempId;
        const effectiveItemId = itemToDelete._id || itemToDelete.tempId;
         const serverListId = listInState._id;
         const serverItemId = itemToDelete._id;
         const isTempList = !!listInState.tempId && !listInState._id;
         const isTempItem = !!itemToDelete.tempId && !itemToDelete._id;


         const action = { type: 'deleteItem', payload: { listId: effectiveListId, itemId: effectiveItemId } };

         applyAndStoreLocally(action);
         setError(null);


         const syncPayload = { listId: serverListId || effectiveListId, itemId: serverItemId || effectiveItemId };


         if (isOnline && isConnected && !isTempList && serverListId && !isTempItem && serverItemId) {
              console.log(`useShoppingListData: Online, emitting deleteItem from list ${serverListId} item ${serverItemId}.`);
             socket.emit('deleteItem', { listId: serverListId, itemId: serverItemId }, (res) => {
                  if (res?.error) {
                      setError(t('error_deleting_item', { message: res.error }));
                      console.error("useShoppingListData: Server error deleting item:", res.error);
                  } else {
                       console.log(`useShoppingListData: Item ${serverItemId} deleted online successfully.`);
                       setError(null);
                  }
             });
         } else {
              console.log(`useShoppingListData: Offline or list/item not synced, queueing deleteItem action for list ${effectiveListId} item ${effectiveItemId}.`);
              const syncAction = { type: 'deleteItem', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }
    }, [currentUser, lists, isOnline, isConnected, socket, t, setError, applyAndStoreLocally, setLists, setPendingActions]);


     // handleToggleItem: Toggles an item's completed status optimistically and syncs via socket/queue.
    const handleToggleItem = useCallback((listId, itemId, completed) => {
         if (!currentUser || !listId || !itemId || typeof completed === 'undefined') { console.warn("useShoppingListData: Toggle item skipped: Missing user, list ID, item ID, or status."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Toggle item skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         const itemToToggle = (listInState.items || []).find(i => i._id === itemId || i.tempId === itemId);
         if (!itemToToggle) { console.warn(`useShoppingListData: Toggle item skipped: Item ${itemId} not found in list ${listId}.`); setError(t('item_not_found_or_deleted')); return; }


        const effectiveListId = listInState._id || listInState.tempId;
        const effectiveItemId = itemToToggle._id || itemToToggle.tempId;
         const serverListId = listInState._id;
         const serverItemId = itemToToggle._id;
         const isTempList = !!listInState.tempId && !listInState._id;
         const isTempItem = !!itemToToggle.tempId && !itemToToggle._id;
         const newCompletedStatus = completed;


         const action = { type: 'toggleItem', payload: { listId: effectiveListId, itemId: effectiveItemId, completed: newCompletedStatus } };

         applyAndStoreLocally(action);
         setError(null);


         const syncPayload = { listId: serverListId || effectiveListId, itemId: serverItemId || effectiveItemId, completed: newCompletedStatus };


         if (isOnline && isConnected && !isTempList && serverListId && !isTempItem && serverItemId) {
              console.log(`useShoppingListData: Online, emitting toggleItem for item ${serverItemId} in list ${serverListId} to completed=${newCompletedStatus}.`);
             socket.emit('toggleItem', syncPayload, (res) => {
                  if (res?.error) {
                      setError(t('error_toggling_item', { message: res.error }));
                      console.error("useShoppingListData: Server error toggling item:", res.error);
                  } else {
                       console.log(`useShoppingListData: Item ${serverItemId} toggled online successfully to completed=${newCompletedStatus}.`);
                       setError(null);
                  }
             });
         } else {
              console.log(`useShoppingListData: Offline or list/item not synced, queueing toggleItem action for list ${effectiveListId} item ${effectiveItemId} to completed=${newCompletedStatus}.`);
              const syncAction = { type: 'toggleItem', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }
    }, [currentUser, lists, isOnline, isConnected, socket, t, setError, applyAndStoreLocally, setLists, setPendingActions]);


     // handleUpdateItemComment: Updates an item's comment optimistically and syncs via socket/queue.
    const handleUpdateItemComment = useCallback((listId, itemId, comment) => {
         if (!currentUser || !listId || !itemId || comment === null || typeof comment === 'undefined') { console.warn("useShoppingListData: Update comment skipped: Missing user, list ID, item ID, or comment."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Update comment skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         const itemToUpdate = (listInState.items || []).find(i => i._id === itemId || i.tempId === itemId);
         if (!itemToUpdate) { console.warn(`useShoppingListData: Update comment skipped: Item ${itemId} not found in list ${listId}.`); setError(t('item_not_found_or_deleted')); return; }

        const effectiveListId = listInState._id || listInState.tempId;
        const effectiveItemId = itemToUpdate._id || itemToUpdate.tempId;
         const serverListId = listInState._id;
         const serverItemId = itemToUpdate._id;
         const isTempList = !!listInState.tempId && !listInState._id;
         const isTempItem = !!itemToUpdate.tempId && !itemToUpdate._id;
         const trimmedComment = comment.trim();


         const action = { type: 'updateItemComment', payload: { listId: effectiveListId, itemId: effectiveItemId, comment: trimmedComment } };

         applyAndStoreLocally(action);
         setError(null);


         const syncPayload = { listId: serverListId || effectiveListId, itemId: serverItemId || effectiveItemId, comment: trimmedComment };


         if (isOnline && isConnected && !isTempList && serverListId && !isTempItem && serverItemId) {
              console.log(`useShoppingListData: Online, emitting updateItemComment for item ${serverItemId} in list ${serverListId}.`);
             socket.emit('updateItemComment', syncPayload, (res) => {
                  if (res?.error) {
                      setError(t('error_updating_comment', { message: res.error }));
                      console.error("useShoppingListData: Server error updating comment:", res.error);
                  } else {
                       console.log(`useShoppingListData: Comment updated online successfully for ${serverItemId}.`);
                       setError(null);
                  }
             });
         } else {
              console.log(`useShoppingListData: Offline or list/item not synced, queueing updateItemComment action for list ${effectiveListId} item ${effectiveItemId}.`);
              const syncAction = { type: 'updateItemComment', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }
    }, [currentUser, lists, isOnline, isConnected, socket, t, setError, applyAndStoreLocally, setLists, setPendingActions]);


     // handleUpdateItemQuantity: Updates an item's quantity optimistically and syncs via socket/queue.
     const handleUpdateItemQuantity = useCallback((listId, itemId, quantityValue, quantityUnit) => {
         if (!currentUser || !listId || !itemId || quantityValue === null || typeof quantityValue === 'undefined' || quantityUnit === null || typeof quantityUnit === 'undefined') { console.warn("useShoppingListData: Update quantity skipped: Missing user, list ID, item ID, or quantity data."); setError(t('action_skipped')); return; }
         const listInState = lists.find(l => l._id === listId || l.tempId === listId);
         if (!listInState) { console.warn(`useShoppingListData: Update quantity skipped: List ${listId} not found in state.`); setError(t('list_not_found_or_deleted')); return; }
         const itemToUpdate = (listInState.items || []).find(i => i._id === itemId || i.tempId === itemId);
         if (!itemToUpdate) { console.warn(`useShoppingListData: Update quantity skipped: Item ${itemId} not found in list ${listId}.`); setError(t('item_not_found_or_deleted')); return; }

        const effectiveListId = listInState._id || listInState.tempId;
        const effectiveItemId = itemToUpdate._id || itemToUpdate.tempId;
         const serverListId = listInState._id;
         const serverItemId = itemToUpdate._id;
         const isTempList = !!listInState.tempId && !listInState._id;
         const isTempItem = !!itemToUpdate.tempId && !itemToUpdate._id;
         const trimmedQuantityUnit = quantityUnit.trim();


         const action = { type: 'updateItemQuantity', payload: { listId: effectiveListId, itemId: effectiveItemId, quantityValue, quantityUnit: trimmedQuantityUnit } };

         applyAndStoreLocally(action);
         setError(null);


         const syncPayload = { listId: serverListId || effectiveListId, itemId: serverItemId || effectiveItemId, quantityValue, quantityUnit: trimmedQuantityUnit };


         if (isOnline && isConnected && !isTempList && serverListId && !isTempItem && serverItemId) {
              console.log(`useShoppingListData: Online, emitting updateItemQuantity for item ${serverItemId} in list ${serverListId}.`);
             socket.emit('updateItemQuantity', syncPayload, (res) => {
                  if (res?.error) {
                      setError(t('error_updating_quantity', { message: res.error }));
                      console.error("useShoppingListData: Server error updating quantity:", res.error);
                  } else {
                       console.log(`useShoppingListData: Quantity updated online successfully for ${serverItemId}.`);
                       setError(null);
                  }
             });
         } else {
              console.log(`useShoppingListData: Offline or list/item not synced, queueing updateItemQuantity action for list ${effectiveListId} item ${effectiveItemId}.`);
              const syncAction = { type: 'updateItemQuantity', payload: syncPayload, id: crypto.randomUUID() };
              const updatedQueue = offlineService.addPendingAction(syncAction);
              offlineService.storePendingActions(updatedQueue);
             setPendingActions(updatedQueue); // Use setter provided by App
              setError(null);
         }
     }, [currentUser, lists, isOnline, isConnected, socket, t, setError, applyAndStoreLocally, setLists, setPendingActions]);


    // --- Derived State (Memoized) ---
    const currentList = useMemo(() => {
        if (!currentListId || !Array.isArray(lists)) return null;
        return lists.find(list => list._id === currentListId) || lists.find(list => list.tempId === currentListId);
    }, [currentListId, lists]);

    const currentListItems = useMemo(() => Array.isArray(currentList?.items) ? currentList.items : [], [currentList]);


    // --- Return State and Handlers ---
    return {
        // State is managed by App, hooks provide access/setters implicitly via props

        // Derived state returned by the hook
        currentList,
        currentListItems,

        // Fetch Handlers returned by the hook
        fetchLists,
        fetchListItems,

        // Navigation Handler returned by the hook
        handleSelectList,

        // Action Handlers returned by the hook
        handleAddList,
        handleDeleteList,
        handleTogglePrivacy,
        handleUpdateListAllowedUsers,
        handleAddItem,
        handleDeleteItem,
        handleToggleItem,
        handleUpdateItemComment,
        handleUpdateItemQuantity,

        // Helper for sync (if needed externally by useSync)
        handleAddItemSuccess,
        applyAndStoreLocally,
    };
}

export default useShoppingListData;