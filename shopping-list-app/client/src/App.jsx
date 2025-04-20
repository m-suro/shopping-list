// client/src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from './socket';

// --- Components (We'll define these below for simplicity in one file for now) ---
function ThemeToggle({ isDarkMode, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="absolute top-4 right-4 p-2 rounded-full bg-secondary dark:bg-dark-secondary text-text dark:text-dark-text hover:opacity-80 transition-opacity"
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
        <li className={`flex items-center justify-between p-2 my-1 rounded transition-colors ${item.completed ? 'bg-green-100 dark:bg-green-900 opacity-60' : 'bg-background dark:bg-dark-background'}`}>
            <div className="flex items-center gap-2 flex-grow cursor-pointer" onClick={() => onToggle(item._id)}>
                <input
                    type="checkbox"
                    checked={item.completed}
                    readOnly // Control checked state via parent div click
                    className="form-checkbox h-5 w-5 text-primary dark:text-dark-primary bg-gray-300 dark:bg-gray-600 border-gray-400 rounded focus:ring-primary dark:focus:ring-dark-primary"
                 />
                <span className={`flex-grow ${item.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-text dark:text-dark-text'}`}>
                    {item.name}
                </span>
            </div>
             <button
                onClick={() => onDelete(item._id)}
                className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold"
                aria-label={`Delete item ${item.name}`}
            >
                ✕
            </button>
        </li>
    );
}


function ShoppingListDetail({ list, items, onBack, onDeleteList }) {
  const listId = list?._id; // Get ID safely

  const handleAddItem = useCallback((targetListId, itemName) => {
      console.log(`Emitting addItem for list ${targetListId}: ${itemName}`);
      socket.emit('addItem', { listId: targetListId, itemName }, (response) => {
          if (response?.error) {
              console.error("Error adding item:", response.error);
              // Handle error UI if needed
          } else {
              console.log("Item added successfully via socket:", response);
              // State update handled by 'itemAdded' listener
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
               // State update handled by 'itemUpdated' listener
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
                 // State update handled by 'itemDeleted' listener
            }
        });
      }
  }, [listId]);

  const confirmDeleteList = () => {
    if (window.confirm(`Are you sure you want to delete the list "${list.name}" and all its items?`)) {
        onDeleteList(listId);
    }
  }

  if (!list) return <div>Loading list...</div>; // Handle case where list is null initially

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
        <ul className="list-none p-0 mb-4">
          {items.map(item => (
            <ShoppingListItem
              key={item._id}
              item={item}
              onToggle={() => handleToggleItem(item._id)}
              onDelete={() => handleDeleteItem(item._id)}
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
        onAddList(listName || 'New Shopping List'); // Default name if empty
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
                           {/* Delete button could be added here too if needed */}
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
     // Check local storage or system preference for initial theme
     return localStorage.getItem('theme') === 'dark' ||
            (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [lists, setLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);
  const [currentListItems, setCurrentListItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentListIdRef = useRef(currentListId); // Ref to access currentListId inside socket listeners

  useEffect(() => {
      currentListIdRef.current = currentListId; // Keep ref updated
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
    try {
        // Use standard fetch for initial load
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/lists`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setLists(data);
        console.log("Lists fetched:", data.length);
    } catch (error) {
        console.error("Failed to fetch lists:", error);
        // Handle error UI
    } finally {
       setIsLoading(false);
    }
  }, []);


  const fetchItemsForList = useCallback(async (listId) => {
       if (!listId) {
           setCurrentListItems([]);
           return;
       };
       console.log(`Fetching items for list: ${listId}`);
       setIsLoading(true); // Maybe use a different loading state for items
       try {
           const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/lists/${listId}/items`);
           if (!response.ok) throw new Error('Network response was not ok');
           const data = await response.json();
           setCurrentListItems(data);
            console.log("Items fetched:", data.length);
       } catch (error) {
           console.error(`Failed to fetch items for list ${listId}:`, error);
           setCurrentListItems([]); // Clear items on error
           // Handle error UI
       } finally {
          setIsLoading(false); // Finished loading items
       }
   }, []);


  // --- Socket Connection & Event Listeners ---
  useEffect(() => {
    console.log("Setting up socket listeners...");

    function onConnect() {
      console.log('Socket connected!');
      setIsConnected(true);
      // Re-fetch lists when re-connecting, in case something was missed
      fetchLists();
       // If we were viewing a list, re-join its room and fetch items
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

    // --- List Updates ---
    function onListsUpdated() {
      console.log("Received listsUpdated event, fetching lists...");
      fetchLists(); // Re-fetch all lists
    }
    function onListDeleted() {
        console.log("Received listDeleted event for the current list.");
        // If the currently viewed list was deleted, go back to the list overview
        if (currentListIdRef.current) {
            setCurrentListId(null);
            setCurrentListItems([]);
             // No need to explicitly leave room, server handles disconnect/navigation implicitly if needed
        }
    }

    // --- Item Updates for the Current List ---
     function onItemAdded(newItem) {
        console.log("Received itemAdded:", newItem);
        // Only add if it belongs to the currently viewed list
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
         // Check against currentListIdRef just in case, though server sends to room
          setCurrentListItems(prevItems => prevItems.filter(item => item._id !== deletedItemId));
     }

    // Connect socket and add listeners
    socket.connect(); // Manually connect
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('listsUpdated', onListsUpdated);
    socket.on('listDeleted', onListDeleted); // For the current list
    socket.on('itemAdded', onItemAdded);
    socket.on('itemUpdated', onItemUpdated);
    socket.on('itemDeleted', onItemDeleted);


    // Initial fetch
    fetchLists();

    // Cleanup function
    return () => {
      console.log("Cleaning up socket listeners...");
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('listsUpdated', onListsUpdated);
      socket.off('listDeleted', onListDeleted);
      socket.off('itemAdded', onItemAdded);
      socket.off('itemUpdated', onItemUpdated);
      socket.off('itemDeleted', onItemDeleted);
      socket.disconnect(); // Disconnect socket when component unmounts
    };
  }, [fetchLists, fetchItemsForList]); // Add fetchItemsForList dependency


 // --- Actions ---
 const handleSelectList = (listId) => {
    if (currentListId === listId) return; // Already viewing this list

    // Leave previous room if exists
    if (currentListId) {
        console.log("Leaving previous list room:", currentListId);
        socket.emit('leaveList', currentListId);
    }

    console.log("Selecting list:", listId);
    setCurrentListId(listId);
    setCurrentListItems([]); // Clear old items immediately
    setIsLoading(true); // Show loading state
    fetchItemsForList(listId); // Fetch items for the new list
    console.log("Joining new list room:", listId);
    socket.emit('joinList', listId); // Join the new room
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
              // State update handled by 'listsUpdated' listener
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
                 // If the deleted list was the current one, the 'listDeleted' listener handles UI update
                 // Otherwise, 'listsUpdated' handles the list overview refresh.
            }
        });
   };


  // --- Render Logic ---
  const currentList = lists.find(list => list._id === currentListId);

  return (
    <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text transition-colors duration-300 font-sans">
      <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
      <main className="max-w-2xl mx-auto p-4 pt-16"> {/* Add padding top for theme toggle */}
        <div className="text-center mb-4 text-xs text-gray-500 dark:text-gray-400">
            Status: {isConnected ? 'Connected' : 'Disconnected'}
        </div>

        {isLoading && !currentListId ? (
            <p className="text-center p-10">Loading Lists...</p> // Initial list load
        ) : currentListId && currentList ? (
            <ShoppingListDetail
                list={currentList}
                items={currentListItems}
                onBack={handleBackToLists}
                onDeleteList={handleDeleteList} // Pass delete handler
                // Pass item handlers down - done inside ShoppingListDetail now
             />
         ) : !isLoading && !currentListId ? ( // Only show lists if not loading and no list selected
             <ShoppingLists
                 lists={lists}
                 onSelectList={handleSelectList}
                 onAddList={handleAddList}
                 onDeleteList={handleDeleteList} // Pass delete handler here too if needed elsewhere
             />
         ) : (
            <p className="text-center p-10">Loading...</p> // General loading or list not found
         )}
      </main>
    </div>
  );
}

export default App;