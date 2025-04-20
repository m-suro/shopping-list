// client/src/App.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { socket } from './socket';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';

// --- Segmented Control Component (No changes) ---
function SegmentedControl({ options, currentValue, onChange, ariaLabel }) {
    return (
        <div className="inline-flex rounded-lg shadow-sm bg-gray-200 dark:bg-gray-700 p-0.5" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors duration-200 ease-in-out focus:z-10 focus:ring-2 focus:ring-offset-1 focus:ring-accent dark:focus:ring-dark-accent focus:ring-offset-gray-200 dark:focus:ring-offset-gray-700 outline-none flex items-center justify-center h-8 w-10`}
                    aria-pressed={currentValue === option.value}
                >
                    <span className={`transition-opacity duration-150 ${currentValue === option.value ? 'opacity-100' : 'opacity-75 hover:opacity-100'}`}>
                        {option.icon}
                    </span>
                </button>
            ))}
        </div>
    );
}

// --- ThemeToggle using Material Symbols Rounded (No changes) ---
function ThemeToggle({ isDarkMode, onToggle }) {
    const { t } = useTranslation();
    const themeOptions = [
        { value: 'light', icon: <span className="material-symbols-rounded text-lg leading-none">light_mode</span> },
        { value: 'dark', icon: <span className="material-symbols-rounded text-lg leading-none">dark_mode</span> }
    ];
    return (
        <SegmentedControl
            options={themeOptions}
            currentValue={isDarkMode ? 'dark' : 'light'}
            onChange={(value) => onToggle(value === 'dark')}
            ariaLabel={t('theme_toggle_aria_label', 'Theme Preference')}
        />
    );
}

// --- LanguageToggle using Image Flags (No changes) ---
function LanguageToggle({ currentLang, onChangeLang }) {
    const { t } = useTranslation();
    const languageOptions = [
        { value: 'en', icon: <img src="/USA.png" alt="USA Flag" className="w-5 h-auto" /> },
        { value: 'pl', icon: <img src="/Poland.png" alt="Poland Flag" className="w-5 h-auto" /> }
    ];
    return (
        <SegmentedControl
            options={languageOptions}
            currentValue={currentLang}
            onChange={onChangeLang}
            ariaLabel={t('language_toggle_aria_label', 'Language Preference')}
        />
    );
}

// --- AddItemInlineForm (No changes) ---
function AddItemInlineForm({ listId, onAddItem, onCancel }) {
    const { t } = useTranslation();
    const [itemName, setItemName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = () => {
        if (!itemName.trim() || !listId) return;
        onAddItem(listId, itemName);
        setItemName('');
        // onCancel?.(); // Optionally close after submit
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel?.();
        }
    };

    // Container div gets flex-grow
    return (
        <div className="flex gap-2 items-center flex-grow ml-1">
            <input
                ref={inputRef}
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('add_item_placeholder')}
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0"
                required
            />
            <button
                type="button"
                onClick={handleSubmit}
                className="p-2 bg-primary dark:bg-dark-primary text-white rounded hover:opacity-90 flex-shrink-0"
            >
                {t('add_button')}
            </button>
        </div>
    );
}


// --- ShoppingListItem (No changes) ---
function ShoppingListItem({ item, onToggle, onDelete }) {
    const { t } = useTranslation();
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
                aria-label={t('delete_item_label', { itemName: item.name })}
            >
                ✕
            </button>
        </li>
    );
}

// --- UPDATED ShoppingListDetail ---
function ShoppingListDetail({ list, items, onBack, onDeleteList }) {
    const { t } = useTranslation();
    const listId = list?._id;
    const [listAnimationParent] = useAutoAnimate();
    const [controlsAnimationParent] = useAutoAnimate();

    const [searchTerm, setSearchTerm] = useState('');
    const [activeControl, setActiveControl] = useState('none'); // 'none', 'search', 'add'

    const filteredAndSortedItems = useMemo(() => {
        if (!items) return [];
        const filtered = items.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return [...filtered].sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return 0;
        });
    }, [items, searchTerm]);

    // --- Callbacks ---
    const handleAddItem = useCallback((targetListId, itemName) => {
        console.log(`Emitting addItem for list ${targetListId}: ${itemName}`);
        socket.emit('addItem', { listId: targetListId, itemName }, (response) => {
            if (response?.error) {
                console.error("Error adding item:", response.error);
            } else {
                console.log("Item added successfully via socket:", response);
                // Optionally close form after adding
                // setActiveControl('none');
            }
        });
    }, []);

    const handleToggleItem = useCallback((itemId) => {
        if (!listId) return;
        socket.emit('toggleItem', { listId, itemId }, (response) => {
            if (response?.error) console.error("Error toggling item:", response.error);
            else console.log("Item toggled successfully via socket:", response);
        });
    }, [listId]);

    const handleDeleteItem = useCallback((itemId) => {
        if (!listId) return;
        if (window.confirm(t('delete_item_confirm'))) {
            socket.emit('deleteItem', { listId, itemId }, (response) => {
                if (response?.error) console.error("Error deleting item:", response.error);
                else console.log("Item deleted successfully via socket");
            });
        }
    }, [listId, t]);

    const confirmDeleteList = () => {
        if (window.confirm(t('delete_list_confirm', { listName: list.name }))) {
            onDeleteList(listId);
        }
    }

    const toggleControl = (controlType) => {
        setActiveControl(prev => {
            if (prev === controlType) {
                if (controlType === 'search') setSearchTerm('');
                return 'none';
            } else {
                if (controlType === 'search') setSearchTerm('');
                // When switching to 'add', ensure search term is cleared if search was active
                if (prev === 'search') setSearchTerm('');
                return controlType;
            }
        });
    };

    const closeActiveControl = () => {
        if (activeControl === 'search') setSearchTerm('');
        setActiveControl('none');
    }

    if (!list) return <div>{t('loading')}</div>;

    const showEmptyListMessage = items.length === 0 && !searchTerm;
    const showNoSearchResultsMessage = filteredAndSortedItems.length === 0 && items.length > 0 && searchTerm;

    return (
        <div className="p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <button onClick={onBack} className="text-primary dark:text-dark-primary hover:underline">
                    {t('back_to_lists')}
                </button>
                <button onClick={confirmDeleteList} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm">
                    {t('delete_list')}
                </button>
            </div>

            {/* List Title */}
            <h2 className="text-2xl font-semibold mb-2 text-primary dark:text-dark-primary">{list.name}</h2>

            {/* --- Controls Row --- */}
            <div
                ref={controlsAnimationParent}
                className="flex items-center gap-2 my-3 py-2 border-b border-t border-gray-200 dark:border-gray-700 min-h-[44px]" // Ensure min-height
            >
                {/* Search Toggle Button */}
                <button
                    onClick={() => toggleControl('search')}
                    className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${activeControl === 'search' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`}
                    aria-label={t(activeControl === 'search' ? 'close_search' : 'open_search')}
                    aria-expanded={activeControl === 'search'}
                >
                    <span className="material-symbols-rounded">search</span>
                </button>

                {/* Add Item Toggle Button */}
                <button
                    onClick={() => toggleControl('add')}
                    className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${activeControl === 'add' ? 'text-accent dark:text-dark-accent bg-accent/10 dark:bg-dark-accent/20' : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-dark-primary'}`}
                    aria-label={t(activeControl === 'add' ? 'close_add_item' : 'open_add_item')}
                    aria-expanded={activeControl === 'add'}
                >
                    <span className="material-symbols-rounded">add_circle</span>
                </button>

                {/* Expanded Area (Search Input OR Add Form) */}
                {activeControl === 'search' && (
                    // Wrap search input in a div for consistent layout
                    <div className="flex items-center flex-grow ml-1">
                        <input
                            type="search"
                            placeholder={t('search_items_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            // Use same padding/styles as AddItemInlineForm's input
                            className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-0"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Escape' && closeActiveControl()}
                        />
                     </div>
                )}

                {activeControl === 'add' && (
                    <AddItemInlineForm
                        listId={listId}
                        onAddItem={handleAddItem}
                        onCancel={closeActiveControl}
                    />
                )}
            </div>


            {/* Item List Area */}
            {showEmptyListMessage ? (
                 <p className="text-gray-500 dark:text-gray-400 italic mt-4 text-center">{t('empty_list_message')}</p>
            ) : (
                <>
                    <ul ref={listAnimationParent} className="list-none p-0 mb-4">
                        {filteredAndSortedItems.map(item => (
                            <ShoppingListItem
                                key={item._id}
                                item={item}
                                onToggle={handleToggleItem}
                                onDelete={handleDeleteItem}
                            />
                        ))}
                    </ul>
                     {showNoSearchResultsMessage && (
                         <p className="text-center text-gray-500 dark:text-gray-400 italic mt-4">{t('no_search_results')}</p>
                     )}
                 </>
            )}
        </div>
    );
}


// --- AddListForm (No changes) ---
function AddListForm({ onAddList }) {
    const { t } = useTranslation();
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
                placeholder={t('new_list_placeholder')}
                className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
            />
            <button type="submit" className="p-2 bg-accent dark:bg-dark-accent text-white rounded hover:opacity-90">
                {t('create_list_button')}
            </button>
        </form>
    );
}

// --- ShoppingLists (No changes) ---
function ShoppingLists({ lists, onSelectList, onAddList, onDeleteList }) {
    const { t } = useTranslation();
    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('app_title')}</h1>
            {lists.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">{t('no_lists_message')}</p>
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

// --- Main App Component (No changes) ---
function App() {
    const { t, i18n } = useTranslation();
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem('theme') === 'dark' ||
            (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    const [currentLanguage, setCurrentLanguage] = useState(i18n.language.split('-')[0]);

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

    const toggleTheme = (isNowDark) => {
        setIsDarkMode(isNowDark);
    };

    // --- Language Handling ---
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    useEffect(() => {
        const handleLanguageChange = (lng) => setCurrentLanguage(lng.split('-')[0]);
        i18n.on('languageChanged', handleLanguageChange);
        setCurrentLanguage(i18n.language.split('-')[0]);
        return () => {
            i18n.off('languageChanged', handleLanguageChange);
        };
    }, [i18n]);

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

        function onListDeleted(deletedListId) {
            console.log("Received listDeleted event for ID:", deletedListId);
            if (currentListIdRef.current === deletedListId) {
                console.log("Current list deleted, navigating back.");
                setCurrentListId(null);
                setCurrentListItems([]);
            } else {
                console.log("A different list was deleted, refreshing list overview.");
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
            {/* Toggles Container */}
            <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
                <LanguageToggle
                    currentLang={currentLanguage}
                    onChangeLang={changeLanguage}
                />
                <ThemeToggle
                    isDarkMode={isDarkMode}
                    onToggle={toggleTheme}
                />
            </div>

            <main className="max-w-2xl mx-auto p-4 pt-20">
                <div className="text-center mb-4 text-xs text-gray-500 dark:text-gray-400">
                    {isConnected ? t('status_connected') : t('status_disconnected')}
                </div>

                {isLoading ? (
                    <p className="text-center p-10">{t('loading')}</p>
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