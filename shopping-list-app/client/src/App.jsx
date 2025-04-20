// client/src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react'; // <-- Import AutoAnimate hook

// --- Components ---
function ThemeToggle({ isDarkMode, onToggle }) {
    return (
        <button
            onClick={onToggle}
            className="absolute top-4 right-4 p-2 rounded-full bg-secondary dark:bg-dark-secondary text-text dark:text-dark-text hover:opacity-80 transition-opacity z-10"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
            {isDarkMode ? '☀️' : '🌙'}
        </button>
    );
}

function AddItemForm({ listId, onAddItem }) {
    const [itemName, setItemName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!itemName.trim() || !listId) return;
        onAddItem(listId, itemName);
        setItemName('');
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
            <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Add new item..."
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                required
            />
            <button type="submit" className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90">
                Add
            </button>
        </form>
    );
}

function ShoppingListItem({ item, onToggle, onDelete }) {
    return (
        <li className={`flex items-center justify-between p-2 my-1 rounded transition-all duration-300 ease-in-out ${item.completed ? 'bg-green-100 dark:bg-green-900 opacity-70' : 'bg-background dark:bg-dark-background hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            <label htmlFor={`item-${item._id}`} className="flex items-center gap-3 flex-grow cursor-pointer mr-2">
                <input
                    id={`item-${item._id}`}
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => onToggle(item._id)}
                    className="absolute opacity-0 w-0 h-0 peer"
                />
                <span
                  className={`flex-shrink-0 w-5 h-5 border-2 rounded transition-colors duration-200 ease-in-out flex items-center justify-center
                             ${item.completed
                               ? 'bg-primary dark:bg-dark-primary border-primary dark:border-dark-primary'
                               : 'bg-white dark:bg-gray-700 border-primary/50 dark:border-dark-primary/50 peer-focus:ring-2 peer-focus:ring-offset-1 peer-focus:ring-offset-transparent peer-focus:ring-accent dark:peer-focus:ring-dark-accent'
                             }`}
                  aria-hidden="true"
                >
                    {item.completed && (
                        <svg className="w-3 h-3 text-white dark:text-dark-background" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </span>
                <span className={`flex-grow transition-colors ${item.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-text dark:text-dark-text'}`}>
                    {item.name}
                </span>
            </label>
            <button
                onClick={() => onDelete(item._id)}
                className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold flex-shrink-0"
                aria-label={`Delete item ${item.name}`}
            >
                ✕
            </button>
        </li>
    );
}

function ShoppingListDetail({ list, items, onBack, onDeleteList }) {
    const listId = list?._id;
    const [animationParent] = useAutoAnimate(); // <-- Initialize AutoAnimate

    const sortedItems = useMemo(() => {
        if (!items) return [];
        return [...items].sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return 0;
        });
    }, [items]);

    const handleAddItem = useCallback((targetListId, itemName) => {
        console.log(`Emitting addItem for list ${targetListId}: ${itemName}`);
        socket.emit('addItem', { listId: targetListId, itemName }, (response) => {
            if (response?.error) {
                console.error("Error adding item:", response.error);
            } else {
                console.log("Item added successfully via socket:", response);
            }
        });
    }, []);

    const handleToggleItem = useCallback((itemId) => {
        if (!listId) return;
        console.log(`Emitting toggleItem for item ${itemId} in list ${listId}`);
        socket.emit('toggleItem', { listId, itemId }, (response) => {
            if (response?.error) {
                console.error("Error toggling item:", response.error);
            } else {
                 console.log("Item toggled successfully via socket:", response);
            }
        });
    }, [listId]);

    const handleDeleteItem = useCallback((itemId) => {
        if (!listId) return;
        console.log(`Emitting deleteItem for item ${itemId} in list ${listId}`);
        if (window.confirm('Are you sure you want to delete this item?')) {
            socket.emit('deleteItem', { listId, itemId }, (response) => {
                if (response?.error) {
                    console.error("Error deleting item:", response.error);
                } else {
                    console.log("Item deleted successfully via socket");
                }
            });
        }
    }, [listId]);

    const confirmDeleteList = () => {
        if (window.confirm(`Are you sure you want to delete the list "${list.name}" and all its items?`)) {
            onDeleteList(listId);
        }
    }

    if (!list) return <div>Loading list...</div>;

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <button onClick={onBack} className="text-primary dark:text-dark-primary hover:underline">
                    ← Back to Lists
                </button>
                <button onClick={confirmDeleteList} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm">
                    Delete List
                </button>
            </div>

            <h2 className="text-2xl font-semibold mb-4 text-primary dark:text-dark-primary">{list.name}</h2>
            {items.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">This list is empty. Add some items below!</p>
            ) : (
                // --- Attach the AutoAnimate ref to the UL ---
                <ul ref={animationParent} className="list-none p-0 mb-4">
                    {sortedItems.map(item => (
                        <ShoppingListItem
                            key={item._id}
                            item={item}
                            onToggle={handleToggleItem}
                            onDelete={handleDeleteItem}
                        />
                    ))}
                </ul>
            )}

            <AddItemForm listId={listId} onAddItem={handleAddItem} />
        </div>
    );
}

function AddListForm({ onAddList }) {
    const [listName, setListName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onAddList(listName || 'New Shopping List');
        setListName('');
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 mt-6 mb-4 p-4 border-t border-secondary dark:border-dark-secondary">
            <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="New list name (optional)"
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
            />
            <button type="submit" className="p-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90">
                Create New List
            </button>
        </form>
    );
}

function ShoppingLists({ lists, onSelectList, onAddList, onDeleteList }) {
    return (
        <div className="p-4">
             <h1 className="text-3xl font-bold mb-6 text-center text-primary dark:text-dark-primary">My Shopping Lists</h1>
             {lists.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">No lists yet. Create one below!</p>
             ) : (
                <ul className="space-y-2 list-none p-0">
                    {lists.map(list => (
                        <li key={list._id}
                            className="flex justify-between items-center p-3 bg-secondary/30 dark:bg-dark-secondary/30 rounded cursor-pointer hover:bg-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors"
                            onClick={() => onSelectList(list._id)}
                        >
                           <span className="font-medium text-text dark:text-dark-text">{list.name}</span>
                           <span className="text-xs text-primary dark:text-dark-primary">→</span>
                        </li>
                    ))}
                </ul>
             )}
            <AddListForm onAddList={onAddList} />
        </div>
    )
}

// --- Main App Component ---
function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem('theme') === 'dark' ||
            (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    const [lists, setLists] = useState([]);
    const [currentListId, setCurrentListId] = useState(null);
    const [currentListItems, setCurrentListItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

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

    const toggleTheme = () => {
        setIsDarkMode(!isDarkMode);
    };

    // --- Fetch Initial Data ---
    const fetchLists = useCallback(async () => {
        console.log("Fetching lists...");
        setIsLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/lists`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setLists(data);
            console.log("Lists fetched:", data.length);
        } catch (error) {
            console.error("Failed to fetch lists:", error);
            setLists([]);
        } finally {
            if (!currentListIdRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    const fetchItemsForList = useCallback(async (listId) => {
        if (!listId) {
            setCurrentListItems([]);
            setIsLoading(false);
            return;
        };
        console.log(`Fetching items for list: ${listId}`);
        setIsLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/lists/${listId}/items`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setCurrentListItems(data);
            console.log("Items fetched:", data.length);
        } catch (error) {
            console.error(`Failed to fetch items for list ${listId}:`, error);
            setCurrentListItems([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- Socket Connection & Event Listeners ---
    useEffect(() => {
        console.log("Setting up socket listeners...");

        function onConnect() {
            console.log('Socket connected!');
            setIsConnected(true);
            fetchLists();
            if (currentListIdRef.current) {
                console.log("Re-joining list room:", currentListIdRef.current);
                socket.emit('joinList', currentListIdRef.current);
                fetchItemsForList(currentListIdRef.current);
            }
        }

        function onDisconnect() {
            console.log('Socket disconnected!');
            setIsConnected(false);
        }

        function onListsUpdated() {
            console.log("Received listsUpdated event, fetching lists...");
            fetchLists();
        }

        function onListDeleted() {
            console.log("Received listDeleted event for the current list.");
            // Check if the deleted list is the one currently being viewed
             // Use the ref here as state might be stale in the listener closure
            if (socket.nsp && socket.nsp.name && currentListIdRef.current === socket.nsp.name.split('#')[1]) {
                 setCurrentListId(null);
                 setCurrentListItems([]);
                 // Consider navigating back programmatically if using a router
             } else {
                 // If a different list was deleted, just refresh the list overview
                 fetchLists();
             }
        }

        function onItemAdded(newItem) {
            console.log("Received itemAdded:", newItem);
            if (newItem.listId === currentListIdRef.current) {
                setCurrentListItems(prevItems => [...prevItems, newItem]);
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
            setCurrentListItems(prevItems => prevItems.filter(item => item._id !== deletedItemId));
        }

        socket.connect();
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('listsUpdated', onListsUpdated);
        socket.on('listDeleted', onListDeleted);
        socket.on('itemAdded', onItemAdded);
        socket.on('itemUpdated', onItemUpdated);
        socket.on('itemDeleted', onItemDeleted);

        fetchLists();

        return () => {
            console.log("Cleaning up socket listeners...");
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('listsUpdated', onListsUpdated);
            socket.off('listDeleted', onListDeleted);
            socket.off('itemAdded', onItemAdded);
            socket.off('itemUpdated', onItemUpdated);
            socket.off('itemDeleted', onItemDeleted);
            socket.disconnect();
        };
    }, [fetchLists, fetchItemsForList]);

    // --- Actions ---
    const handleSelectList = (listId) => {
        if (currentListId === listId) return;
        if (currentListId) {
            console.log("Leaving previous list room:", currentListId);
            socket.emit('leaveList', currentListId);
        }
        console.log("Selecting list:", listId);
        setCurrentListId(listId);
        setCurrentListItems([]);
        fetchItemsForList(listId);
        console.log("Joining new list room:", listId);
        socket.emit('joinList', listId);
    };

    const handleBackToLists = () => {
        if (currentListId) {
            console.log("Leaving list room:", currentListId);
            socket.emit('leaveList', currentListId);
        }
        setCurrentListId(null);
        setCurrentListItems([]);
    };

    const handleAddList = (listName) => {
        console.log("Emitting addList:", listName);
        socket.emit('addList', listName, (response) => {
            if (response?.error) {
                console.error("Error adding list:", response.error);
            } else {
                console.log("List added via socket");
            }
        });
    };

    const handleDeleteList = (listId) => {
        console.log("Emitting deleteList:", listId);
        socket.emit('deleteList', listId, (response) => {
            if (response?.error) {
                console.error("Error deleting list:", response.error);
            } else {
                console.log("List deleted via socket");
            }
        });
    };

    // --- Render Logic ---
    const currentList = !isLoading && lists.find(list => list._id === currentListId);

    return (
        <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">
            <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
            <main className="max-w-2xl mx-auto p-4 pt-16">
                <div className="text-center mb-4 text-xs text-gray-500 dark:text-gray-400">
                    Status: {isConnected ? 'Connected' : 'Disconnected'}
                </div>

                {isLoading ? (
                     <p className="text-center p-10">Loading...</p>
                 ) : currentListId && currentList ? (
                     <ShoppingListDetail
                         list={currentList}
                         items={currentListItems}
                         onBack={handleBackToLists}
                         onDeleteList={handleDeleteList}
                     />
                 ) : (
                     <ShoppingLists
                         lists={lists}
                         onSelectList={handleSelectList}
                         onAddList={handleAddList}
                         onDeleteList={handleDeleteList}
                     />
                 )}
            </main>
        </div>
    );
}

export default App;