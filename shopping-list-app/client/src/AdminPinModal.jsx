// client/src/AdminPinModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

function AdminPinModal({ isOpen, onClose, onVerify, error, setError }) {
    const { t } = useTranslation();
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            // Clear previous PIN and error when opening
            setPin('');
            setError(null);
        }
    }, [isOpen, setError]); // Add setError dependency

    // Handle Escape key press
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            setError(t('admin_pin_invalid', 'Invalid Admin PIN format.'));
            return;
        }
        setIsLoading(true);
        setError(null);
        // Call the verification function passed from App
        await onVerify(pin);
        setIsLoading(false);
        // Don't close here automatically, let onVerify success handle it
    };

    const handlePinChange = (e) => {
        const value = e.target.value.replace(/\D/g, ''); // Allow only digits
        if (value.length <= 4) {
            setPin(value);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="admin-pin-modal-title">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-xs w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter" onClick={(e) => e.stopPropagation()}>
                <h2 id="admin-pin-modal-title" className="text-xl font-semibold mb-4 text-primary dark:text-dark-primary">{t('admin_pin_modal_title', 'Admin Access')}</h2>
                {error && (
                     <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm">
                         {error}
                     </p>
                 )}
                <form onSubmit={handleSubmit}>
                    <label htmlFor="admin-pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('admin_pin_label', 'Enter Admin PIN')}
                    </label>
                    <input
                        ref={inputRef}
                        type="password"
                        id="admin-pin"
                        value={pin}
                        onChange={handlePinChange}
                        required
                        maxLength="4"
                        minLength="4"
                        inputMode="numeric"
                        pattern="\d{4}"
                        className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent mb-4 text-center tracking-[.5em]" // Added centering and tracking
                        aria-label={t('admin_pin_label')}
                    />
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity">
                            {t('cancel_button', 'Cancel')}
                        </button>
                        <button type="submit" disabled={isLoading || pin.length !== 4} className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center min-w-[80px]">
                            {isLoading ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            ) : (
                                t('admin_pin_verify_button', 'Verify')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AdminPinModal;