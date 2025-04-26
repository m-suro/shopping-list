// client/src/services/offlineService.jsx
// Utility module for handling offline data persistence using localStorage.

// --- Constants ---
const LISTS_STORAGE_KEY = 'shoppingLists';
const ACTIONS_STORAGE_KEY = 'pendingActions';

// --- List Storage ---
export const getStoredLists = () => {
    try {
        const stored = localStorage.getItem(LISTS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Error getting stored lists:", error);
        return [];
    }
};

export const storeLists = (lists) => {
    try {
        localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists || []));
    } catch (error) {
        console.error("Error storing lists:", error);
    }
};

// --- Pending Actions Queue ---
export const getPendingActions = () => {
    try {
        const stored = localStorage.getItem(ACTIONS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Error getting pending actions:", error);
        return [];
    }
};

export const storePendingActions = (actions) => {
    try {
        localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions || []));
    } catch (error) {
        console.error("Error storing pending actions:", error);
    }
};

export const addPendingAction = (action) => {
    const currentActions = getPendingActions();
    const newActions = [...currentActions, action];
    storePendingActions(newActions);
    return newActions; // Return updated queue
};

export const clearPendingActions = () => {
    storePendingActions([]);
};


// --- Apply Action Locally (Optimistic Update) ---
// ** MODIFIED: Added case for 'updateItemQuantity' **
export const applyActionLocally = (currentLists, action) => {
    console.log(`Applying action locally: ${action.type}`, action.payload);
    let updatedLists = [...(currentLists || [])]; // Ensure it's an array

    const findListIndex = (listId) => updatedLists.findIndex(l => l._id === listId || l.tempId === listId);
    const findItemIndex = (list, itemId) => (list?.items || []).findIndex(i => i._id === itemId || i.tempId === itemId);

    switch (action.type) {
        case 'addList': {
            const optimisticList = { ...action.payload, isOffline: true };
            // Avoid duplicates if already added somehow
            if (!updatedLists.some(l => l._id === optimisticList._id || l.tempId === optimisticList.tempId)) {
                updatedLists.push(optimisticList);
            }
            break;
        }
        case 'deleteList': {
            updatedLists = updatedLists.filter(l => l._id !== action.payload.listId && l.tempId !== action.payload.listId);
            break;
        }
         case 'toggleListPrivacy': {
             const listIdx = findListIndex(action.payload.listId);
             if (listIdx > -1) {
                 updatedLists[listIdx] = { ...updatedLists[listIdx], isPublic: action.payload.isPublic, isOffline: true };
             }
             break;
         }
        case 'addItem': {
            const listIdx = findListIndex(action.payload.listId);
            if (listIdx > -1) {
                const list = updatedLists[listIdx];
                const newItem = { ...action.payload.item, isOffline: true };
                // Ensure items array exists and avoid duplicates
                const items = Array.isArray(list.items) ? list.items : [];
                if (!items.some(i => i._id === newItem._id || i.tempId === newItem.tempId)) {
                     updatedLists[listIdx] = { ...list, items: [...items, newItem], isOffline: true };
                }
            }
            break;
        }
        case 'deleteItem': {
            const listIdx = findListIndex(action.payload.listId);
            if (listIdx > -1) {
                const list = updatedLists[listIdx];
                const items = (list.items || []).filter(i => i._id !== action.payload.itemId && i.tempId !== action.payload.itemId);
                updatedLists[listIdx] = { ...list, items: items, isOffline: true };
            }
            break;
        }
        case 'toggleItem': {
            const listIdx = findListIndex(action.payload.listId);
            if (listIdx > -1) {
                const list = updatedLists[listIdx];
                const itemIdx = findItemIndex(list, action.payload.itemId);
                if (itemIdx > -1) {
                    const updatedItem = { ...list.items[itemIdx], completed: !list.items[itemIdx].completed, isOffline: true };
                    const updatedItems = [...list.items];
                    updatedItems[itemIdx] = updatedItem;
                    updatedLists[listIdx] = { ...list, items: updatedItems, isOffline: true };
                }
            }
            break;
        }
        case 'updateItemComment': {
             const listIdx = findListIndex(action.payload.listId);
             if (listIdx > -1) {
                 const list = updatedLists[listIdx];
                 const itemIdx = findItemIndex(list, action.payload.itemId);
                 if (itemIdx > -1) {
                     const updatedItem = { ...list.items[itemIdx], comment: action.payload.comment, isOffline: true };
                     const updatedItems = [...list.items];
                     updatedItems[itemIdx] = updatedItem;
                     updatedLists[listIdx] = { ...list, items: updatedItems, isOffline: true };
                 }
             }
             break;
         }
         // --- NEW CASE ---
         case 'updateItemQuantity': {
            const listIdx = findListIndex(action.payload.listId);
            if (listIdx > -1) {
                const list = updatedLists[listIdx];
                const itemIdx = findItemIndex(list, action.payload.itemId);
                if (itemIdx > -1) {
                    const updatedItem = {
                        ...list.items[itemIdx],
                        quantityValue: action.payload.quantityValue, // Update value
                        quantityUnit: action.payload.quantityUnit,   // Update unit
                        isOffline: true
                    };
                    const updatedItems = [...list.items];
                    updatedItems[itemIdx] = updatedItem;
                    updatedLists[listIdx] = { ...list, items: updatedItems, isOffline: true };
                }
            }
            break;
         }
         // --- END NEW CASE ---
        default:
            console.warn(`Unknown action type for local application: ${action.type}`);
    }

    storeLists(updatedLists); // Store the optimistically updated state
    return updatedLists;
};