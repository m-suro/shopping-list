// client/src/services/offlineService.jsx
// Description: Provides functions for managing offline data persistence (lists)
// and pending actions queue using localStorage.

const LISTS_STORAGE_KEY = 'offlineShoppingLists';
const PENDING_ACTIONS_KEY = 'offlinePendingActions';

// --- List Storage ---

/**
 * Retrieves the lists array from localStorage.
 * @returns {Array} The stored lists, or an empty array if none/error.
 */
export const getStoredLists = () => {
    try {
        const stored = localStorage.getItem(LISTS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Error getting stored lists:", error);
        return [];
    }
};

/**
 * Stores the lists array into localStorage.
 * @param {Array} lists - The lists array to store.
 */
export const storeLists = (lists) => {
    try {
        localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists || []));
    } catch (error) {
        console.error("Error storing lists:", error);
    }
};

// --- Pending Actions Queue ---

/**
 * Retrieves the pending actions array from localStorage.
 * @returns {Array} The stored actions, or an empty array if none/error.
 */
export const getPendingActions = () => {
    try {
        const stored = localStorage.getItem(PENDING_ACTIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Error getting pending actions:", error);
        return [];
    }
};

/**
 * Stores the pending actions array into localStorage.
 * Use this internally after modifying the queue.
 * @param {Array} actions - The actions array to store.
 */
export const storePendingActions = (actions) => {
    try {
        localStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(actions || []));
        console.log(`Stored ${actions.length} pending actions.`); // Debug log
    } catch (error) {
        console.error("Error storing pending actions:", error);
    }
};


/**
 * Adds a new action to the pending actions queue in localStorage.
 * Ensures each action has a unique ID if not provided.
 * @param {Object} action - The action object { type, payload, id? }.
 * @returns {Array} The updated pending actions array.
 */
export const addPendingAction = (action) => {
    if (!action || !action.type || !action.payload) {
        console.error("Attempted to add invalid action:", action);
        return getPendingActions(); // Return current queue without modification
    }
    const currentActions = getPendingActions();
    // Ensure the action has a unique ID (App.jsx should add this now)
    const actionToAdd = action.id ? action : { ...action, id: crypto.randomUUID() };
    const newActions = [...currentActions, actionToAdd];
    storePendingActions(newActions); // Save updated queue
    console.log(`Action added to pending queue (ID: ${actionToAdd.id}, Type: ${actionToAdd.type}). Total: ${newActions.length}`);
    return newActions;
};

/**
 * Clears all pending actions from localStorage.
 */
export const clearPendingActions = () => {
    try {
        localStorage.removeItem(PENDING_ACTIONS_KEY);
        console.log("Cleared pending actions from storage.");
    } catch (error) {
        console.error("Error clearing pending actions:", error);
    }
    // Note: This function only clears storage. The calling code should update state (e.g., setPendingActions([])).
};


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
    // Ensure we always start with a safe array
    const safeCurrentLists = Array.isArray(currentLists) ? currentLists : [];
    // Create a shallow copy to work with initially. Deeper copies happen as needed.
    let newLists = [...safeCurrentLists];

    console.log("Applying local action:", type, payload);

    try {
        switch (type) {
            case 'addList': {
                // Payload should be the optimistic list object including tempId
                const listExists = newLists.some(l => l._id === payload._id || l.tempId === payload.tempId);
                if (!listExists) {
                    // Add the new list, ensuring it has an offline flag
                    const listToAdd = { ...payload, items: payload.items || [], isOffline: true }; // Ensure items array exists
                    // Return a new array with the added list
                    newLists = [...newLists, listToAdd];
                } else {
                    console.warn("Attempted to add list locally that already exists:", payload.tempId || payload._id);
                }
                break;
            }
            case 'deleteList': {
                const listIdToDelete = payload.listId;
                const initialLength = newLists.length;
                // Return a new array excluding the deleted list
                newLists = newLists.filter(list => list._id !== listIdToDelete && list.tempId !== listIdToDelete);
                if (newLists.length === initialLength) {
                    console.warn("Attempted to delete list locally that wasn't found:", listIdToDelete);
                }
                break;
            }
            case 'toggleListPrivacy': {
                const listIdToToggle = payload.listId;
                let listFound = false;
                // Return a new array with the modified list replaced
                newLists = newLists.map(list => {
                    if (list._id === listIdToToggle || list.tempId === listIdToToggle) {
                        listFound = true;
                        // Return a *new* list object with updated privacy and offline flag
                        return {
                            ...list,
                            isPublic: payload.isPublic,
                            isOffline: true // Mark list as modified offline
                        };
                    }
                    return list; // Return unmodified list
                });
                if (!listFound) {
                    console.warn("Attempted to toggle privacy for list locally that wasn't found:", listIdToToggle);
                }
                break;
             }
             // --- Item Actions ---
             case 'addItem': {
                 const targetListId = payload.listId;
                 let listFoundAndUpdated = false;
                 // Return a new array with the modified list replaced
                 newLists = newLists.map(list => {
                    if (list._id === targetListId || list.tempId === targetListId) {
                        // Ensure items array exists and is a copy
                        const currentItems = Array.isArray(list.items) ? [...list.items] : [];
                        // Item payload should be the full optimistic item object
                        const newItemWithFlag = { ...payload.item, isOffline: true };
                        // Add item only if it doesn't exist by tempId or _id
                        const itemExists = currentItems.some(i => i._id === newItemWithFlag._id || i.tempId === newItemWithFlag.tempId);

                        if (!itemExists) {
                            currentItems.push(newItemWithFlag); // Add to the copied items array
                            listFoundAndUpdated = true;
                            // Return a *new* list object with the *new* items array and offline flag
                            return { ...list, items: currentItems, isOffline: true };
                        } else {
                            console.warn("Attempted to add item locally that already exists:", newItemWithFlag.tempId || newItemWithFlag._id);
                            // Still return a copy of the list to potentially update isOffline flag if needed elsewhere?
                            // For now, return original list reference if item wasn't added.
                            return list;
                        }
                    }
                    return list; // Return unmodified list
                 });
                 if (!listFoundAndUpdated) {
                    console.warn("Attempted to add item to list locally that wasn't found:", targetListId);
                 }
                 break;
            }
            case 'toggleItem': {
                const { listId, itemId } = payload;
                let listFoundAndUpdated = false;
                 // Return a new array with the modified list replaced
                 newLists = newLists.map(list => {
                    if (list._id === listId || list.tempId === listId) {
                        if (Array.isArray(list.items)) {
                             let itemUpdated = false;
                             // Return a *new* items array with the modified item replaced
                             const updatedItems = list.items.map(item => {
                                 if (item._id === itemId || item.tempId === itemId) {
                                     itemUpdated = true;
                                     // Return a *new* item object with toggled state and offline flag
                                     return { ...item, completed: !item.completed, isOffline: true };
                                 }
                                 return item; // Return unmodified item
                             });

                             // If an item was actually updated, return a new list object
                             if (itemUpdated) {
                                 listFoundAndUpdated = true;
                                 return { ...list, items: updatedItems, isOffline: true };
                             }
                        }
                    }
                    return list; // Return unmodified list
                 });
                 if (!listFoundAndUpdated) {
                     console.warn(`Attempted to toggle item ${itemId} in list ${listId} locally, but list or item not found.`);
                 }
                 break;
            }
            case 'deleteItem': {
                 const { listId, itemId } = payload;
                 let listFoundAndUpdated = false;
                  // Return a new array with the modified list replaced
                 newLists = newLists.map(list => {
                     if (list._id === listId || list.tempId === listId) {
                          if (Array.isArray(list.items)) {
                               const initialLength = list.items.length;
                               // Return a *new* items array excluding the deleted item
                               const updatedItems = list.items.filter(item => item._id !== itemId && item.tempId !== itemId);
                               // If an item was actually deleted, return a new list object
                               if (updatedItems.length < initialLength) {
                                   listFoundAndUpdated = true;
                                   return { ...list, items: updatedItems, isOffline: true };
                               }
                          }
                     }
                     return list; // Return unmodified list
                 });
                 if (!listFoundAndUpdated) {
                     console.warn(`Attempted to delete item ${itemId} from list ${listId} locally, but list or item not found.`);
                 }
                 break;
             }
            default:
                console.warn("Unknown local action type:", type);
        }
    } catch (error) {
        console.error("Error applying local action:", type, error);
        // Return the original unmodified state on error to prevent corruption
        return safeCurrentLists;
    }

    // console.log("State after applying local action:", newLists); // Keep for debugging if needed
    return newLists; // Return the new state array
};