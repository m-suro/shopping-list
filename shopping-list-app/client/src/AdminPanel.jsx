// client/src/AdminPanel.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoAnimate } from '@formkit/auto-animate/react';

// --- Helper: Add User Form ---
function AddUserForm({ onAddUser, error, setError, isLoading }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!username.trim() || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            setError(t('admin_add_user_invalid_input', 'Username cannot be empty and PIN must be 4 digits.'));
            return;
        }
        onAddUser(username.toLowerCase().trim(), pin);
        // Clear form on success (handled in parent by hiding the form)
        setUsername('');
        setPin('');
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 border rounded-md bg-gray-50 dark:bg-gray-700/50 mt-4 space-y-3">
             <h3 className="text-lg font-medium text-primary dark:text-dark-primary mb-2">{t('admin_add_user_title', 'Add New User')}</h3>
             {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div>
                <label htmlFor="new-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('username_label')}</label>
                <input
                    type="text"
                    id="new-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                    autoCapitalize="none"
                />
            </div>
            <div>
                 <label htmlFor="new-pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('pin_label')} (4 digits)</label>
                 <input
                     type="password" // Use password for masking, but pattern enforces digits
                     id="new-pin"
                     value={pin}
                     onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                     required
                     maxLength="4"
                     minLength="4"
                     inputMode="numeric"
                     pattern="\d{4}"
                     className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                 />
             </div>
            <button type="submit" disabled={isLoading} className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center">
                {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : t('add_user_button', 'Add User')}
            </button>
        </form>
    );
}


// --- Main Admin Panel Component ---
function AdminPanel({ onExitAdminMode }) {
    const { t } = useTranslation();
    const API_URL = import.meta.env.VITE_SERVER_URL;

    // User Management State
    const [users, setUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userError, setUserError] = useState(null);
    const [showAddUserForm, setShowAddUserForm] = useState(false);
    const [addUserFormError, setAddUserFormError] = useState(null);
    const [isAddingUser, setIsAddingUser] = useState(false);

    // List Management State
    const [allLists, setAllLists] = useState([]);
    const [isLoadingLists, setIsLoadingLists] = useState(false);
    const [listError, setListError] = useState(null);
    const [listFilterUser, setListFilterUser] = useState('all'); // 'all' or userId
    const [listFilterPrivacy, setListFilterPrivacy] = useState('all'); // 'all', 'public', 'private'

    const [usersListParent] = useAutoAnimate();
    const [listsListParent] = useAutoAnimate();
    const [addUserFormParent] = useAutoAnimate();

    // --- Fetch Users ---
    const fetchUsers = useCallback(async () => {
        setIsLoadingUsers(true);
        setUserError(null);
        try {
            const res = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to fetch users');
            }
            const fetchedUsers = await res.json();
            setUsers(fetchedUsers);
        } catch (err) {
            console.error("Error fetching users:", err);
            setUserError(err.message);
        } finally {
            setIsLoadingUsers(false);
        }
    }, [API_URL]);

    // --- Fetch Lists ---
    const fetchAllLists = useCallback(async () => {
        setIsLoadingLists(true);
        setListError(null);
        const params = new URLSearchParams();
        if (listFilterUser !== 'all') params.append('userId', listFilterUser);
        if (listFilterPrivacy !== 'all') params.append('privacy', listFilterPrivacy);

        try {
            const res = await fetch(`${API_URL}/api/admin/lists?${params.toString()}`, { credentials: 'include' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to fetch lists');
            }
            const fetchedLists = await res.json();
            setAllLists(fetchedLists);
        } catch (err) {
            console.error("Error fetching lists:", err);
            setListError(err.message);
        } finally {
            setIsLoadingLists(false);
        }
    }, [API_URL, listFilterUser, listFilterPrivacy]);

    // --- Initial Data Fetch ---
    useEffect(() => {
        fetchUsers();
        fetchAllLists();
    }, [fetchUsers, fetchAllLists]); // Fetch on mount

     // Re-fetch lists when filters change
     useEffect(() => {
        fetchAllLists();
    }, [listFilterUser, listFilterPrivacy, fetchAllLists]);


    // --- User Actions ---
    const handleAddUser = async (username, pin) => {
        setIsAddingUser(true);
        setAddUserFormError(null);
        try {
            const res = await fetch(`${API_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin }),
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to add user');
            }
            // Success
            fetchUsers(); // Refresh user list
            setShowAddUserForm(false); // Hide form
            setAddUserFormError(null); // Clear form error on success
        } catch (err) {
            console.error("Error adding user:", err);
            setAddUserFormError(err.message);
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleDeleteUser = async (userId, username) => {
        if (window.confirm(t('admin_delete_user_confirm', `Are you sure you want to delete user "${username}"? This will also delete all lists owned by this user.`))) {
            setUserError(null);
            try {
                const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                 const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || 'Failed to delete user');
                }
                // Success
                fetchUsers(); // Refresh user list
                // Check if the deleted user was selected in filter, if so, reset filter
                if (listFilterUser === userId) {
                    setListFilterUser('all'); // Reset filter which triggers list refetch
                } else {
                    fetchAllLists(); // Otherwise, just refresh lists normally
                }
            } catch (err) {
                console.error("Error deleting user:", err);
                setUserError(err.message);
            }
        }
    };

    // --- List Actions ---
    const handleDeleteList = async (listId, listName) => {
        if (window.confirm(t('admin_delete_list_confirm', `Are you sure you want to delete the list "${listName}"? This action cannot be undone.`))) {
            setListError(null);
             // Consider adding per-list loading state if needed
            try {
                 const res = await fetch(`${API_URL}/api/admin/lists/${listId}`, {
                     method: 'DELETE',
                     credentials: 'include',
                 });
                  const data = await res.json().catch(() => ({}));
                 if (!res.ok) {
                     throw new Error(data.message || 'Failed to delete list');
                 }
                 // Success
                 fetchAllLists(); // Refresh list overview
             } catch (err) {
                 console.error("Error deleting list:", err);
                 setListError(err.message);
             }
         }
     };

    // --- Sorted Users for Dropdown ---
    const sortedUsersForFilter = useMemo(() => {
        return [...users].sort((a, b) => a.username.localeCompare(b.username));
    }, [users]);


    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                <h1 className="text-2xl font-semibold text-primary dark:text-dark-primary">
                    {t('admin_panel_title', 'Admin Panel')}
                </h1>
                <button
                    onClick={onExitAdminMode}
                    className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600 transition-colors text-sm flex items-center gap-1"
                    title={t('back_to_app', 'Back to App')}
                >
                    <span className="material-symbols-rounded text-lg leading-none">arrow_back</span>
                    {t('back_to_app', 'Back to App')}
                </button>
            </div>

            {/* User Management Section */}
            <section>
                <h2 className="text-xl font-semibold mb-3 text-text dark:text-dark-text">{t('admin_user_management_title', 'User Management')}</h2>
                 {userError && <p className="text-red-600 dark:text-red-400 mb-3">{userError}</p>}
                {isLoadingUsers ? (
                    <p>{t('loading', 'Loading')}...</p>
                ) : (
                    <div ref={usersListParent} className="space-y-2">
                        {users.map(user => (
                            <div key={user._id} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                <div>
                                    <span className="font-medium text-text dark:text-dark-text">{user.username}</span>
                                    {user.isAdmin && <span className="ml-2 text-xs font-semibold bg-blue-200 text-blue-800 dark:bg-blue-700 dark:text-blue-100 px-1.5 py-0.5 rounded">{t('admin_role', 'Admin')}</span>}
                                </div>
                                <button
                                    onClick={() => handleDeleteUser(user._id, user.username)}
                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={t('admin_delete_user_button', 'Delete User')}
                                    disabled={user.isAdmin} // Optional: Prevent deleting other admins through UI?
                                >
                                    <span className="material-symbols-rounded align-middle">delete</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                 <div ref={addUserFormParent} className="mt-4">
                    <button
                        onClick={() => setShowAddUserForm(prev => !prev)}
                        className="px-3 py-1.5 rounded bg-secondary dark:bg-dark-secondary text-text dark:text-dark-text hover:opacity-90 transition-opacity text-sm flex items-center gap-1"
                    >
                         <span className="material-symbols-rounded text-lg leading-none">{showAddUserForm ? 'close' : 'add'}</span>
                         {showAddUserForm ? t('admin_cancel_add_user', 'Cancel Add User') : t('admin_add_user_button', 'Add User')}
                    </button>
                    {showAddUserForm && (
                        <AddUserForm
                            onAddUser={handleAddUser}
                            error={addUserFormError}
                            setError={setAddUserFormError}
                            isLoading={isAddingUser}
                        />
                    )}
                 </div>
            </section>

            {/* List Overview Section */}
            <section>
                 <h2 className="text-xl font-semibold mb-3 text-text dark:text-dark-text">{t('admin_list_overview_title', 'List Overview')}</h2>

                 {/* Filters */}
                 <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                     <div>
                        <label htmlFor="list-filter-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin_filter_by_user', 'Filter by User')}</label>
                        <select
                            id="list-filter-user"
                            value={listFilterUser}
                            onChange={(e) => setListFilterUser(e.target.value)}
                             className="p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-[150px]"
                        >
                            <option value="all">{t('admin_filter_all_users', 'All Users')}</option>
                            {sortedUsersForFilter.map(user => (
                                <option key={user._id} value={user._id}>{user.username}</option>
                            ))}
                        </select>
                     </div>
                     <div>
                        <label htmlFor="list-filter-privacy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('admin_filter_by_privacy', 'Filter by Privacy')}</label>
                        <select
                            id="list-filter-privacy"
                            value={listFilterPrivacy}
                            onChange={(e) => setListFilterPrivacy(e.target.value)}
                            className="p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent min-w-[120px]"
                        >
                            <option value="all">{t('admin_filter_all_privacy', 'All')}</option>
                            <option value="public">{t('list_privacy_public', 'Public')}</option>
                            <option value="private">{t('list_privacy_private', 'Private')}</option>
                        </select>
                     </div>
                 </div>

                 {listError && <p className="text-red-600 dark:text-red-400 mb-3">{listError}</p>}
                {isLoadingLists ? (
                    <p>{t('loading', 'Loading')}...</p>
                ) : allLists.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 italic">{t('admin_no_lists_found', 'No lists found matching filters.')}</p>
                ) : (
                    <div ref={listsListParent} className="space-y-2">
                        {allLists.map(list => (
                            <div key={list._id} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">
                                <div className="flex justify-between items-start mb-1 gap-2">
                                    <span className="font-semibold text-base text-primary dark:text-dark-primary break-words">{list.name}</span>
                                    <div className="flex items-center flex-shrink-0 gap-2">
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${list.isPublic ? 'bg-blue-200 text-blue-800 dark:bg-blue-700 dark:text-blue-100' : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100'}`}>
                                            {list.isPublic ? t('list_privacy_public', 'Public') : t('list_privacy_private', 'Private')}
                                        </span>
                                        {/* --- Add Delete Button for Lists --- */}
                                        <button
                                            onClick={() => handleDeleteList(list._id, list.name)}
                                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-0.5"
                                            title={t('admin_delete_list_button', 'Delete List')}
                                        >
                                            <span className="material-symbols-rounded align-middle text-lg">delete_forever</span>
                                        </button>
                                        {/* --- End Delete Button --- */}
                                     </div>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">{t('admin_list_owner', 'Owner')}: {list.owner?.username || t('unknown_user', 'Unknown')}</p>
                                <p className="text-gray-600 dark:text-gray-400">{t('admin_list_items_count', 'Items')}: {list.items?.length || 0}</p>
                                {!list.isPublic && list.allowedUsers && list.allowedUsers.length > 0 && (
                                    <p className="text-gray-600 dark:text-gray-400">{t('admin_list_allowed_users', 'Shared with')}: {list.allowedUsers.map(u => u.username).join(', ')}</p>
                                )}
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">ID: {list._id}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default AdminPanel;