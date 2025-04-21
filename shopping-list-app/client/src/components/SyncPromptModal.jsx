// client/src/components/SyncPromptModal.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

function SyncPromptModal({ isOpen, onClose, onConfirmSync, pendingActionCount }) {
    const { t } = useTranslation();

    // Add simple fade-in animation (optional)
    const modalClasses = isOpen
        ? 'opacity-100 scale-100'
        : 'opacity-0 scale-95 pointer-events-none';
    const backdropClasses = isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none';

    // Prevent closing modal when clicking inside
    const handleModalContentClick = (e) => {
        e.stopPropagation();
    };

    if (!isOpen) return null; // Don't render if not open

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ease-in-out ${backdropClasses}`}
            onClick={onClose} // Close on backdrop click
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-modal-title"
        >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm"></div> {/* Backdrop */}

            <div
                className={`relative w-full max-w-md transform rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl transition-all duration-200 ease-in-out ${modalClasses}`}
                onClick={handleModalContentClick}
            >
                <h2 id="sync-modal-title" className="text-xl font-semibold text-primary dark:text-dark-primary mb-4">
                    {t('sync_offline_changes_title')}
                </h2>

                <p className="mb-6 text-text dark:text-dark-text">
                    {t('sync_offline_changes_message', { count: pendingActionCount })}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity"
                    >
                        {t('sync_button_later')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmSync}
                        className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
                    >
                        {t('sync_button_now')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SyncPromptModal;