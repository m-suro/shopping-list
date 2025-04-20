// client/src/AdminPanel.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

// Placeholder Admin Panel component
function AdminPanel({ onExitAdminMode }) {
    const { t } = useTranslation();

    return (
        <div className="p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
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

             {/* TODO: Add Admin functionalities here */}
             <p className="text-center text-gray-500 dark:text-gray-400 mt-6">
                 Admin features (User Management, List Management) will go here.
             </p>

         </div>
    );
}

export default AdminPanel;