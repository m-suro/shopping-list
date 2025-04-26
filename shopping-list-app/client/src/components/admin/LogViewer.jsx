// client/src/LogViewer.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoAnimate } from '@formkit/auto-animate/react';

// --- Helper Functions ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleString(undefined, {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false // Use 24-hour format
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return dateString; // Fallback
    }
};

const renderDetails = (details) => {
    if (!details) return 'N/A';
    if (typeof details === 'string') return details;
    if (typeof details === 'object') {
        // Simple JSON string representation for now
        // Could be expanded to render specific keys nicely
        try {
            return JSON.stringify(details, null, 2); // Pretty print JSON
        } catch (e) {
            return '[Object]'; // Fallback for complex objects
        }
    }
    return String(details);
};

// --- Constants for Action Types (Mirror Backend Enums) ---
// It's good practice to have these defined on the frontend as well
// for consistency in filters and display. Ideally, fetch these from backend.
const ACTION_TYPES = [
    'USER_LOGIN_SUCCESS', 'USER_LOGIN_FAIL', 'USER_LOGOUT',
    'ADMIN_PIN_VERIFY_SUCCESS', 'ADMIN_PIN_VERIFY_FAIL',
    'ADMIN_USER_CREATE', 'ADMIN_USER_DELETE',
    'ADMIN_LIST_DELETE',
    'LIST_CREATE', 'LIST_DELETE', 'LIST_PRIVACY_TOGGLE',
    'LIST_USER_INVITE', 'LIST_USER_REMOVE',
    'ITEM_ADD', 'ITEM_DELETE', 'ITEM_TOGGLE', 'ITEM_COMMENT_UPDATE',
    'AUTH_CHECK'
];

const TARGET_TYPES = [
    'USER', 'LIST', 'ITEM', 'AUTH', 'SYSTEM', 'NONE'
];


// --- Log Viewer Component ---
function LogViewer({ onExit }) {
    const { t } = useTranslation();
    const API_URL = import.meta.env.VITE_SERVER_URL;

    // Data and Loading State
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [allUsers, setAllUsers] = useState([]); // For user filter dropdown

    // Filter State
    const [filterUserId, setFilterUserId] = useState(''); // 'all' or user ID
    const [filterActionType, setFilterActionType] = useState(''); // 'all' or action type
    const [filterTargetType, setFilterTargetType] = useState(''); // 'all' or target type
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');

    // Sorting State
    const [sortBy, setSortBy] = useState('timestamp');
    const [sortOrder, setSortOrder] = useState('desc');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [limit, setLimit] = useState(50); // Items per page

    const [tableBodyParent] = useAutoAnimate();
    const [filtersParent] = useAutoAnimate();

    // --- Fetch Users for Filter ---
    const fetchUsersForFilter = useCallback(async () => {
        // Reuse the admin user fetch logic if possible, or create a specific one
        try {
            const res = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch users for filter');
            const fetchedUsers = await res.json();
            setAllUsers(fetchedUsers.sort((a, b) => a.username.localeCompare(b.username)));
        } catch (err) {
            console.error("Error fetching users for filter:", err);
            // Don't block log viewing if user fetch fails, maybe show a warning
            setError(t('log_viewer_error_fetch_users', 'Could not load users for filtering.'));
        }
    }, [API_URL, t]);

    // --- Fetch Logs ---
    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (filterUserId) params.append('userId', filterUserId);
        if (filterActionType) params.append('actionType', filterActionType);
        if (filterTargetType) params.append('targetType', filterTargetType);
        if (filterDateStart) params.append('dateStart', filterDateStart);
        if (filterDateEnd) params.append('dateEnd', filterDateEnd);
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
        params.append('page', currentPage);
        params.append('limit', limit);

        try {
            const res = await fetch(`${API_URL}/api/admin/logs?${params.toString()}`, { credentials: 'include' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                 if (res.status === 401 || res.status === 403) {
                    // Handle potential auth issues, maybe force exit?
                    setError(t('log_viewer_error_unauthorized', 'Unauthorized or session expired. Please exit and re-verify admin access.'));
                 } else {
                    throw new Error(data.message || t('log_viewer_error_fetch_logs', 'Failed to fetch logs'));
                 }
                 setLogs([]); // Clear logs on error
                 setTotalPages(1);
            } else {
                const data = await res.json();
                setLogs(data.logs || []);
                setTotalPages(data.totalPages || 1);
            }
        } catch (err) {
            console.error("Error fetching logs:", err);
            setError(err.message);
            setLogs([]);
            setTotalPages(1);
        } finally {
            setIsLoading(false);
        }
    }, [
        API_URL, filterUserId, filterActionType, filterTargetType, filterDateStart, filterDateEnd,
        sortBy, sortOrder, currentPage, limit, t
    ]);

    // --- Effects ---
    useEffect(() => {
        fetchUsersForFilter(); // Fetch users once on mount
    }, [fetchUsersForFilter]);

    useEffect(() => {
        fetchLogs(); // Fetch logs whenever relevant state changes
    }, [fetchLogs]); // Dependencies managed by useCallback hook

     // Reset page to 1 when filters change
     useEffect(() => {
        setCurrentPage(1);
    }, [filterUserId, filterActionType, filterTargetType, filterDateStart, filterDateEnd, limit]);

    // --- Handlers ---
    const handleSort = (newSortBy) => {
        if (newSortBy === sortBy) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(newSortBy);
            setSortOrder('desc'); // Default to descending on new column
        }
        setCurrentPage(1); // Reset page when sorting changes
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const getSortIndicator = (column) => {
        if (sortBy !== column) return null;
        return sortOrder === 'asc' ? '▲' : '▼';
    };

    return (
        // Use a container that allows scrolling internally if content overflows
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 md:p-6 space-y-6 h-full flex flex-col max-h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h1 className="text-2xl font-semibold text-primary dark:text-dark-primary">
                    {t('log_viewer_title', 'Activity Logs')}
                </h1>
                <button
                    onClick={onExit}
                    className="px-3 py-1 rounded bg-gray-500 text-white hover:bg-gray-600 transition-colors text-sm flex items-center gap-1"
                    title={t('admin_panel_title', 'Back to Admin Panel')} // Reuse existing translation
                >
                    <span className="material-symbols-rounded text-lg leading-none">arrow_back</span>
                    {t('admin_panel_title', 'Back to Admin Panel')}
                </button>
            </div>

            {/* Filters Section */}
            <div ref={filtersParent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 flex-shrink-0">
                {/* User Filter */}
                <div>
                    <label htmlFor="log-filter-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('log_viewer_filter_user', 'User')}</label>
                    <select
                        id="log-filter-user"
                        value={filterUserId}
                        onChange={(e) => setFilterUserId(e.target.value)}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent text-sm"
                    >
                        <option value="">{t('log_viewer_filter_all', 'All')}</option>
                        {allUsers.map(user => (
                            <option key={user._id} value={user._id}>{user.username}</option>
                        ))}
                         <option value="system">{t('log_viewer_filter_system', 'System/No User')}</option>
                    </select>
                </div>
                {/* Action Type Filter */}
                <div>
                    <label htmlFor="log-filter-action" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('log_viewer_filter_action', 'Action')}</label>
                    <select
                        id="log-filter-action"
                        value={filterActionType}
                        onChange={(e) => setFilterActionType(e.target.value)}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent text-sm"
                    >
                        <option value="">{t('log_viewer_filter_all', 'All')}</option>
                        {ACTION_TYPES.sort().map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                {/* Target Type Filter */}
                <div>
                    <label htmlFor="log-filter-target" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('log_viewer_filter_target', 'Target Type')}</label>
                    <select
                        id="log-filter-target"
                        value={filterTargetType}
                        onChange={(e) => setFilterTargetType(e.target.value)}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent text-sm"
                    >
                        <option value="">{t('log_viewer_filter_all', 'All')}</option>
                        {TARGET_TYPES.sort().map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                 {/* Date Start Filter */}
                 <div>
                     <label htmlFor="log-filter-date-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('log_viewer_filter_date_start', 'Date From')}</label>
                     <input
                         type="date"
                         id="log-filter-date-start"
                         value={filterDateStart}
                         onChange={(e) => setFilterDateStart(e.target.value)}
                         className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent text-sm"
                         max={filterDateEnd || undefined} // Prevent start date being after end date
                     />
                 </div>
                 {/* Date End Filter */}
                 <div>
                     <label htmlFor="log-filter-date-end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('log_viewer_filter_date_end', 'Date To')}</label>
                     <input
                         type="date"
                         id="log-filter-date-end"
                         value={filterDateEnd}
                         onChange={(e) => setFilterDateEnd(e.target.value)}
                         className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent text-sm"
                         min={filterDateStart || undefined} // Prevent end date being before start date
                     />
                 </div>
            </div>

            {/* Log Table - Allow vertical scrolling */}
            <div className="overflow-x-auto flex-grow flex flex-col min-h-0">
                 {error && <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>}
                 {isLoading ? (
                     <div className="flex justify-center items-center flex-grow">
                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-dark-primary"></div>
                         <span className="ml-3 text-gray-500 dark:text-gray-400">{t('loading', 'Loading')}...</span>
                     </div>
                 ) : logs.length === 0 ? (
                     <p className="text-center text-gray-500 dark:text-gray-400 italic mt-6 flex-grow flex items-center justify-center">
                         {t('log_viewer_no_logs', 'No logs found matching the criteria.')}
                     </p>
                 ) : (
                    <div className="overflow-y-auto flex-grow">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th scope="col" onClick={() => handleSort('timestamp')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-600">Timestamp {getSortIndicator('timestamp')}</th>
                                    <th scope="col" onClick={() => handleSort('username')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-600">User {getSortIndicator('username')}</th>
                                    <th scope="col" onClick={() => handleSort('actionType')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-600">Action {getSortIndicator('actionType')}</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Target</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">IP Address</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Details</th>
                                </tr>
                            </thead>
                            <tbody ref={tableBodyParent} className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {logs.map(log => (
                                    <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.username || <span className="italic text-gray-400">System</span>}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.actionType}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {log.targetType}{log.targetId ? ` (${log.targetId})` : ''}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.ipAddress || 'N/A'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                            <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-y-auto bg-gray-100 dark:bg-gray-700 p-1 rounded">
                                                <code>{renderDetails(log.details)}</code>
                                            </pre>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
            </div>

             {/* Pagination */}
             {!isLoading && logs.length > 0 && (
                 <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                     <span className="text-sm text-gray-700 dark:text-gray-300">
                        {t('pagination_page_info', 'Page {{currentPage}} of {{totalPages}}', { currentPage, totalPages })}
                     </span>
                     <div className="flex gap-2">
                         <button
                             onClick={() => handlePageChange(currentPage - 1)}
                             disabled={currentPage <= 1}
                             className="px-3 py-1 rounded bg-secondary dark:bg-dark-secondary text-text dark:text-dark-text text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             {t('pagination_previous', 'Previous')}
                         </button>
                         <button
                             onClick={() => handlePageChange(currentPage + 1)}
                             disabled={currentPage >= totalPages}
                             className="px-3 py-1 rounded bg-secondary dark:bg-dark-secondary text-text dark:text-dark-text text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                             {t('pagination_next', 'Next')}
                         </button>
                     </div>
                 </div>
             )}
        </div>
    );
}

export default LogViewer;