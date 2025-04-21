// client/src/services/offlineService.jsx
// Description: Provides functions for managing offline data persistence (lists)
// and pending actions queue using localStorage.

const LISTS_STORAGE_KEY = 'offlineShoppingLists';
const PENDING_ACTIONS_KEY = 'offlinePendingActions';

// --- List Storage ---
export const getStoredLists = () => { /* ... (no change) ... */ try { const stored = localStorage.getItem(LISTS_STORAGE_KEY); return stored ? JSON.parse(stored) : []; } catch (error) { console.error("Error getting stored lists:", error); return []; } };
export const storeLists = (lists) => { /* ... (no change) ... */ try { localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists || [])); } catch (error) { console.error("Error storing lists:", error); } };

// --- Pending Actions Queue ---
export const getPendingActions = () => { /* ... (no change) ... */ try { const stored = localStorage.getItem(PENDING_ACTIONS_KEY); return stored ? JSON.parse(stored) : []; } catch (error) { console.error("Error getting pending actions:", error); return []; } };
export const storePendingActions = (actions) => { /* ... (no change) ... */ try { localStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(actions || [])); console.log(`Stored ${actions.length} pending actions.`); } catch (error) { console.error("Error storing pending actions:", error); } };
export const addPendingAction = (action) => { /* ... (no change) ... */ if (!action || !action.type || !action.payload) { console.error("Attempted to add invalid action:", action); return getPendingActions(); } const currentActions = getPendingActions(); const actionToAdd = action.id ? action : { ...action, id: crypto.randomUUID() }; const newActions = [...currentActions, actionToAdd]; storePendingActions(newActions); console.log(`Action added to pending queue (ID: ${actionToAdd.id}, Type: ${actionToAdd.type}). Total: ${newActions.length}`); return newActions; };
export const clearPendingActions = () => { /* ... (no change) ... */ try { localStorage.removeItem(PENDING_ACTIONS_KEY); console.log("Cleared pending actions from storage."); } catch (error) { console.error("Error clearing pending actions:", error); } };


/**
 * Applies a single action optimistically to a local copy of lists/items,
 * adding offline flags to indicate the change hasn't been synced.
 * IMPORTANT: This function MUST return new array/object references for
 * modified lists and items to ensure React detects the state change.
 *
 * @param {Array} currentLists - The current array of lists state.
 * @param {Object} action - The action object { type, payload }.
 * @returns {Array} The new lists array with the action applied locally.
 */
export const applyActionLocally = (currentLists, action) => {
    const { type, payload } = action;
    const safeCurrentLists = Array.isArray(currentLists) ? currentLists : [];
    let newLists = [...safeCurrentLists]; // Shallow copy

    console.log("Applying local action:", type, payload);

    try {
        switch (type) {
            case 'addList': { /* ... (no change) ... */ const listExists = newLists.some(l => l._id === payload._id || l.tempId === payload.tempId); if (!listExists) { const listToAdd = { ...payload, items: payload.items || [], isOffline: true }; newLists = [...newLists, listToAdd]; } else { console.warn("Attempted to add list locally that already exists:", payload.tempId || payload._id); } break; }
            case 'deleteList': { /* ... (no change) ... */ const listIdToDelete = payload.listId; const initialLength = newLists.length; newLists = newLists.filter(list => list._id !== listIdToDelete && list.tempId !== listIdToDelete); if (newLists.length === initialLength) { console.warn("Attempted to delete list locally that wasn't found:", listIdToDelete); } break; }
            case 'toggleListPrivacy': { /* ... (no change) ... */ const listIdToToggle = payload.listId; let listFound = false; newLists = newLists.map(list => { if (list._id === listIdToToggle || list.tempId === listIdToToggle) { listFound = true; return { ...list, isPublic: payload.isPublic, isOffline: true }; } return list; }); if (!listFound) { console.warn("Attempted to toggle privacy for list locally that wasn't found:", listIdToToggle); } break; }
            case 'addItem': { /* ... (no change) ... */ const targetListId = payload.listId; let listFoundAndUpdated = false; newLists = newLists.map(list => { if (list._id === targetListId || list.tempId === targetListId) { const currentItems = Array.isArray(list.items) ? [...list.items] : []; const newItemWithFlag = { ...payload.item, isOffline: true }; const itemExists = currentItems.some(i => i._id === newItemWithFlag._id || i.tempId === newItemWithFlag.tempId); if (!itemExists) { currentItems.push(newItemWithFlag); listFoundAndUpdated = true; return { ...list, items: currentItems, isOffline: true }; } else { console.warn("Attempted to add item locally that already exists:", newItemWithFlag.tempId || newItemWithFlag._id); return list; } } return list; }); if (!listFoundAndUpdated) { console.warn("Attempted to add item to list locally that wasn't found:", targetListId); } break; }
            case 'toggleItem': { /* ... (no change) ... */ const { listId, itemId } = payload; let listFoundAndUpdated = false; newLists = newLists.map(list => { if (list._id === listId || list.tempId === listId) { if (Array.isArray(list.items)) { let itemUpdated = false; const updatedItems = list.items.map(item => { if (item._id === itemId || item.tempId === itemId) { itemUpdated = true; return { ...item, completed: !item.completed, isOffline: true }; } return item; }); if (itemUpdated) { listFoundAndUpdated = true; return { ...list, items: updatedItems, isOffline: true }; } } } return list; }); if (!listFoundAndUpdated) { console.warn(`Attempted to toggle item ${itemId} in list ${listId} locally, but list or item not found.`); } break; }
            case 'deleteItem': { /* ... (no change) ... */ const { listId, itemId } = payload; let listFoundAndUpdated = false; newLists = newLists.map(list => { if (list._id === listId || list.tempId === listId) { if (Array.isArray(list.items)) { const initialLength = list.items.length; const updatedItems = list.items.filter(item => item._id !== itemId && item.tempId !== itemId); if (updatedItems.length < initialLength) { listFoundAndUpdated = true; return { ...list, items: updatedItems, isOffline: true }; } } } return list; }); if (!listFoundAndUpdated) { console.warn(`Attempted to delete item ${itemId} from list ${listId} locally, but list or item not found.`); } break; }

            // --- NEW CASE for Comments ---
            case 'updateItemComment': {
                const { listId, itemId, comment } = payload;
                let listFoundAndUpdated = false;
                 newLists = newLists.map(list => {
                    // Find the correct list
                    if (list._id === listId || list.tempId === listId) {
                        if (Array.isArray(list.items)) {
                            let itemUpdated = false;
                             // Create a new items array with the updated comment
                             const updatedItems = list.items.map(item => {
                                 if (item._id === itemId || item.tempId === itemId) {
                                     itemUpdated = true;
                                     // Return a new item object with the updated comment and offline flag
                                     return { ...item, comment: comment, isOffline: true };
                                 }
                                 return item; // Return unmodified item
                             });
                             // If an item was actually updated, return a new list object
                             if (itemUpdated) {
                                 listFoundAndUpdated = true;
                                 return { ...list, items: updatedItems, isOffline: true }; // Mark list as offline too
                             }
                         }
                    }
                    return list; // Return unmodified list
                 });
                 if (!listFoundAndUpdated) {
                     console.warn(`Attempted to update comment for item ${itemId} in list ${listId} locally, but list or item not found.`);
                 }
                 break;
            }
            // --- END NEW CASE ---

            default:
                console.warn("Unknown local action type:", type);
        }
    } catch (error) {
        console.error("Error applying local action:", type, error);
        return safeCurrentLists; // Return original state on error
    }

    return newLists; // Return the new state array
};