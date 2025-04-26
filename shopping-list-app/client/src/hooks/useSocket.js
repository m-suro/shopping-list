// client/src/hooks/useSocket.js
import { useEffect, useCallback } from 'react';
import { socket } from '../socket';
import * as offlineService from '../services/offlineService';

function useSocket({
    t,
    currentUser,
    isOnline,
    isSocketAttempted,
    setIsConnected,
    setIsSocketAttempted,
    setError,
    currentView,
    currentListIdRef,
    lists,
    setLists,
    handleBackToLists,
    handleActionCompletedByServer,
    handleAddItemSuccess,
    fetchLists,
    fetchListItems,
    isAuthLoading,
    isLoading,
    isSyncing,
    error,
}) {
    // Move all useCallback definitions to the top level of the hook
    // instead of inside useEffect
    const onConnect = useCallback(() => {
        console.log("useSocket: Socket connected.");
        setIsConnected(true);

        if (error === t('status_disconnected') || error?.includes(t('connection_failed_error'))) {
            setError(null);
        }

        if (currentUser && !isAuthLoading && !isLoading && !isSyncing) {
            console.log("useSocket: Connected and authenticated, fetching latest data.");
            fetchLists();

            if (currentView === 'detail' && currentListIdRef.current) {
                setTimeout(() => {
                    fetchListItems(currentListIdRef.current);
                }, 100);
            }
        } else if (!currentUser) {
            console.log("useSocket: Connected, but user is null. Fetching skipped.");
        } else {
            console.log(`useSocket: Connected, but skipping initial fetch due to loading states: isAuthLoading=${isAuthLoading}, isLoading=${isLoading}, isSyncing=${isSyncing}`);
        }

    }, [setIsConnected, setError, currentUser, isAuthLoading, isLoading, isSyncing, fetchLists, currentView, currentListIdRef, fetchListItems, error, t]);

    const onDisconnect = useCallback((reason) => {
        console.log("useSocket: Socket disconnected:", reason);
        setIsConnected(false);

        if (isOnline && currentUser && currentView !== 'login' && !isAuthLoading && !isLoading && !isSyncing) {
            setError(t('status_disconnected'));
            setTimeout(() => setError(null), 5000);
        }

        if (reason === 'io server disconnect' || reason === 'transport error') {
            console.warn(`useSocket: Socket disconnected due to server or transport error ('${reason}').`);
        }

    }, [setIsConnected, setError, isOnline, currentUser, currentView, isAuthLoading, isLoading, isSyncing, t]);

    const onConnectError = useCallback((err) => {
        console.error("useSocket: Socket connection error:", err);
        setIsConnected(false);

        if (isOnline && currentUser && currentView !== 'login' && !isAuthLoading && !isLoading && !isSyncing) {
            setError(t('connection_failed_error', { message: err.message || 'Unknown error' }));
        }

    }, [setIsConnected, setError, isOnline, currentUser, currentView, isAuthLoading, isLoading, isSyncing, t]);

    // Move all other useCallback handlers to the top level here
    const handleListsUpdated = useCallback((data) => {
        console.log("useSocket: Socket event: listsUpdated", data);
        if (!Array.isArray(data)) { console.warn("useSocket: listsUpdated event received non-array data:", data); return; }
        const serverLists = data.map(list => ({ ...list, isOffline: false }));

        setLists(currentLists => {
            const safeCurrentLists = currentLists || [];
            const currentListMap = new Map(safeCurrentLists.map(l => [l._id || l.tempId, l]));
            const serverListMap = new Map(serverLists.map(l => [l._id, l]));

            const mergedLists = serverLists.map(serverList => {
                const existingList = currentListMap.get(serverList._id);
                const itemsToUse = (existingList && Array.isArray(existingList.items)) ? existingList.items : (Array.isArray(serverList.items) ? serverList.items.map(item => ({...item, isOffline: false})) : []);

                return { ...serverList, items: itemsToUse, isOffline: false };
            });

            safeCurrentLists.forEach(localList => {
                if (localList.tempId && !localList._id && !serverListMap.has(localList._id) && !mergedLists.some(l => l.tempId === localList.tempId)) {
                    mergedLists.push(localList);
                }
            });

            const uniqueLists = Array.from(new Map(mergedLists.map(list => [list._id || list.tempId, list])).values());

            offlineService.storeLists(uniqueLists);
            return uniqueLists;
        });
    }, [setLists]);

    const handleListItemsUpdated = useCallback((data) => {
        console.log("useSocket: Socket event: listItemsUpdated", data);
        if (!data || !data.listId || !Array.isArray(data.items)) { console.warn("useSocket: listItemsUpdated event received invalid data:", data); return; }
        const listId = data.listId;

        const listInState = lists.find(l => l._id === listId);
        if (!listInState) { console.warn(`useSocket: listItemsUpdated event for list ${listId}: List not found in state by ID.`); return; }

        const serverItems = data.items.map(item => ({ ...item, isOffline: false }));

        setLists(currentLists => {
            const updatedLists = (currentLists || []).map(list =>
                list._id === listId ? { ...list, items: serverItems, isOffline: false } : list
            );
            offlineService.storeLists(updatedLists);
            return updatedLists;
        });

        currentListIdRef.current === listId && console.log(`useSocket: listItemsUpdated event received for current list ${listId}. State updated.`);
    }, [setLists, lists, currentListIdRef]);

    const handleListDeleted = useCallback((listId) => {
        console.log("useSocket: Socket event: listDeleted", listId);
        setLists(currentLists => {
            const updatedLists = (currentLists || []).filter(list => list._id !== listId);
            offlineService.storeLists(updatedLists);
            return updatedLists;
        });
        currentListIdRef.current === listId && (console.log(`useSocket: Currently viewing deleted list ${listId}, navigating back.`), handleBackToLists());
    }, [setLists, currentListIdRef, handleBackToLists]);

    const handleListSharingUpdated = useCallback((data) => {
        console.log("useSocket: Socket event: listSharingUpdated", data);
        if (!data || !data.listId || typeof data.isPublic === 'undefined' || !Array.isArray(data.allowedUsers)) { console.warn("useSocket: listSharingUpdated event received invalid data:", data); return; }
        const { listId, isPublic, allowedUsers } = data;

        const listInState = lists.find(l => l._id === listId);
        if (!listInState) { console.warn(`useSocket: listSharingUpdated event for list ${listId}: List not found in state by ID.`); return; }

        setLists(currentLists => {
            const updatedLists = (currentLists || []).map(list =>
                list._id === listId ? { ...list, isPublic: isPublic, allowedUsers: allowedUsers, isOffline: false } : list
            );
            offlineService.storeLists(updatedLists);
            return updatedLists;
        });
        currentListIdRef.current === listId && console.log(`useSocket: listSharingUpdated event received for current list ${listId}. State updated.`);
    }, [setLists, lists, currentListIdRef]);

    const listActionCompletedCallback = useCallback((data) => {
        handleActionCompletedByServer(data);
        if (data.actionType === 'addItem' && data.tempItemId && data.serverItem) {
            console.log(`useSocket: Received addItem completion for temp ID ${data.tempItemId} with server item ID ${data.serverItem._id}.`);
            handleAddItemSuccess(data.serverItem, data.tempItemId);
        }
    }, [handleActionCompletedByServer, handleAddItemSuccess]);

    // Effect to manage the socket connection lifecycle
    useEffect(() => {
        console.log(`useSocket effect: Online=${isOnline}, User=${!!currentUser?.username}, Connected=${socket.connected}, Attempted=${isSocketAttempted}`);

        if (isOnline && currentUser && !socket.connected && !isSocketAttempted) {
            console.log("useSocket effect: Conditions met, attempting socket connect.");
            socket.connect();
            setIsSocketAttempted(true);
        }
        else if ((!isOnline || !currentUser) && socket.connected) {
            console.log("useSocket effect: Conditions not met, disconnecting socket.");
            socket.disconnect();
        }

        // Register Socket Event Listeners
        console.log("useSocket: Registering socket event listeners.");
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);

        socket.on('listsUpdated', handleListsUpdated);
        socket.on('listItemsUpdated', handleListItemsUpdated);
        socket.on('listDeleted', handleListDeleted);
        socket.on('listSharingUpdated', handleListSharingUpdated);

        socket.on('listActionCompleted', listActionCompletedCallback);

        // Cleanup Function
        console.log("useSocket: Returning cleanup function for socket listeners.");
        return () => {
            console.log("useSocket: Cleaning up socket event listeners.");
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);

            socket.off('listsUpdated', handleListsUpdated);
            socket.off('listItemsUpdated', handleListItemsUpdated);
            socket.off('listDeleted', handleListDeleted);
            socket.off('listSharingUpdated', handleListSharingUpdated);

            socket.off('listActionCompleted', listActionCompletedCallback);
        };

    }, [
        isOnline, 
        currentUser, 
        isSocketAttempted, 
        setIsSocketAttempted,
        onConnect,
        onDisconnect,
        onConnectError,
        handleListsUpdated,
        handleListItemsUpdated,
        handleListDeleted,
        handleListSharingUpdated,
        listActionCompletedCallback
    ]);

    return {}; // No state or handlers returned directly
}

export default useSocket;