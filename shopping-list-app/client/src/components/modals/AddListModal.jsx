// client/src/components/modals/AddListModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useTranslation } from 'react-i18next';

// --- Add List Modal Component ---
// Modal form for creating a new shopping list.
function AddListModal({ isOpen, onClose, onAddList }) {
    const { t } = useTranslation();
    const [listName, setListName] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const inputRef = useRef(null);
    const [parent] = useAutoAnimate(); // For animating the modal content changes

    // Effect to focus the input when the modal opens and reset state
    useEffect(() => {
        if (isOpen) {
            // Use a slight delay to ensure the modal is rendered before focusing
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            setListName(''); // Reset name
            setIsPublic(false); // Reset privacy
        }
    }, [isOpen]); // Rerun effect when modal opens/closes

    // Effect to close the modal on Escape key press
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        // Add event listener only when the modal is open
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        // Cleanup function to remove the event listener
        return () => {
            if (isOpen) { // Only remove if it was added
                window.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [isOpen, onClose]); // Rerun effect if isOpen or onClose changes

    // Handle form submission
    const handleSubmit = (e) => {
        e.preventDefault();
        // Call the onAddList prop with the list name and privacy state
        onAddList(listName.trim(), isPublic);
        // Close the modal after submission
        onClose();
    };

    // Don't render anything if the modal is not open
    if (!isOpen) {
        return null;
    }

    return (
        // Fixed overlay for the modal backdrop
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out"
            onClick={onClose} // Close modal when clicking the backdrop
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-list-modal-title"
        >
            {/* Modal content container */}
            <div
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter"
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
                ref={parent} // Apply auto-animate to the modal content
            >
                {/* Modal Title */}
                <h2 id="add-list-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">
                    {t('create_list_button')}
                </h2>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {/* List Name Input */}
                    <input
                        ref={inputRef}
                        type="text"
                        value={listName}
                        onChange={(e) => setListName(e.target.value)}
                        placeholder={t('new_list_placeholder')}
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent mb-4"
                        aria-label={t('new_list_placeholder')}
                        maxLength={100}
                        required // Make list name required
                    />

                    {/* Privacy Toggle */}
                    <div className="mb-4 flex items-center justify-start gap-3 bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                        <label htmlFor="list-privacy-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex items-center gap-2">
                            <span className={`material-symbols-rounded text-lg ${isPublic ? 'text-blue-500' : 'text-yellow-600'}`}>
                                {isPublic ? 'public' : 'lock'}
                            </span>
                            {isPublic ? t('list_privacy_public') : t('list_privacy_private')}
                        </label>
                        <button
                            type="button"
                            id="list-privacy-toggle"
                            onClick={() => setIsPublic(!isPublic)}
                            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-700 focus:ring-primary dark:focus:ring-dark-primary ${isPublic ? 'bg-blue-500' : 'bg-gray-400 dark:bg-gray-500'}`}
                            aria-pressed={isPublic}
                            aria-label={t('list_privacy_toggle_label')}
                        >
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${isPublic ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                         {/* Short info text for privacy */}
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink min-w-0">
                            ({isPublic ? t('list_public_info_short') : t('list_private_info_short')})
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity"
                        >
                            {t('cancel_button')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
                        >
                            {t('create_button')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddListModal;