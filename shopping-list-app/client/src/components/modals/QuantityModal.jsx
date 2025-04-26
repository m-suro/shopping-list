// client/src/QuantityModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutoAnimate } from '@formkit/auto-animate/react';

function QuantityModal({
    isOpen,
    onClose,
    currentItemName = 'Item', // Default name if not provided
    currentQuantityValue = null, // Default to null if not set
    currentQuantityUnit = '',   // Default to empty string
    onSaveQuantity // Function to call with (newValue, newUnit)
}) {
    const { t } = useTranslation();
    const [editedValue, setEditedValue] = useState('');
    const [editedUnit, setEditedUnit] = useState('');
    const valueInputRef = useRef(null);
    const [parent] = useAutoAnimate();

    // Effect to reset state when modal opens and populate with current values
    useEffect(() => {
        if (isOpen) {
            // Set state based on props, handle null value specifically for the input
            setEditedValue(currentQuantityValue !== null ? String(currentQuantityValue) : '');
            setEditedUnit(currentQuantityUnit || '');
            // Focus the value input shortly after opening
            setTimeout(() => {
                valueInputRef.current?.focus();
                valueInputRef.current?.select(); // Select text for easy replacement
            }, 50); // Small delay to ensure modal is rendered
        }
    }, [isOpen, currentQuantityValue, currentQuantityUnit]);

    // Effect to handle Escape key press
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleValueChange = (e) => {
        // Allow empty string or positive integers/decimals potentially
        // Basic validation: allow digits, potentially a single decimal point.
        // Or just rely on type="number" for basic handling
        const value = e.target.value;
         // Allow empty string, or numbers (potentially with decimals if step allows)
         // Basic filter: allow only numbers and potentially a decimal point
         // For integer only: value.replace(/[^0-9]/g, '')
        setEditedValue(value);
    };

    const handleUnitChange = (e) => {
        setEditedUnit(e.target.value);
    };

    const handleSave = (e) => {
        e.preventDefault(); // Prevent default form submission if wrapped in form

        // Parse the value, treat empty string as null (meaning "not set")
        const finalValue = editedValue.trim() === '' ? null : Number(editedValue);
        const finalUnit = editedUnit.trim();

        // Further validation if needed (e.g., ensure value is non-negative if required)
        if (finalValue !== null && isNaN(finalValue)) {
             console.error("Invalid quantity value entered.");
             // Optionally show an error message to the user here
             return;
         }
         // Optional: Check unit length against schema limit (50 chars)
         if (finalUnit.length > 50) {
             console.error("Quantity unit too long.");
             // Optionally show an error message
             return;
         }


        // Call the save callback provided by the parent
        onSaveQuantity(finalValue, finalUnit);
        // onClose(); // Let the parent decide if it should close immediately or after backend confirmation
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200 ease-in-out"
            onClick={onClose} // Close on overlay click
            role="dialog"
            aria-modal="true"
            aria-labelledby="quantity-modal-title"
        >
            <div
                className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full transform transition-all duration-200 ease-in-out scale-95 opacity-0 animate-modal-enter"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
                ref={parent}
            >
                <h2 id="quantity-modal-title" className="text-xl font-semibold mb-1 text-primary dark:text-dark-primary">
                    {t('quantity_modal_title', 'Set Quantity')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 truncate" title={currentItemName}>
                    {t('quantity_modal_item_label', 'Item')}: {currentItemName}
                </p>

                <form onSubmit={handleSave}>
                    <div className="mb-4">
                        <label htmlFor="quantity-value" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('quantity_modal_value_label', 'Quantity')}
                        </label>
                        <input
                            ref={valueInputRef}
                            type="number" // Use number type for better mobile keyboards and basic validation
                            id="quantity-value"
                            value={editedValue}
                            onChange={handleValueChange}
                            placeholder={t('quantity_modal_value_placeholder', 'e.g., 1, 5, 100')}
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                            // step="1" // Uncomment for integer steps only
                            // min="0" // Uncomment to prevent negative numbers via browser validation
                        />
                    </div>

                    <div className="mb-6">
                        <label htmlFor="quantity-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('quantity_modal_unit_label', 'Unit (Optional)')}
                        </label>
                        <input
                            type="text"
                            id="quantity-unit"
                            value={editedUnit}
                            onChange={handleUnitChange}
                            placeholder={t('quantity_modal_unit_placeholder', 'e.g., kg, ml, pcs, loaves')}
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                            maxLength={50} // Match schema limit
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-text dark:text-dark-text hover:opacity-80 transition-opacity"
                        >
                            {t('cancel_button', 'Cancel')}
                        </button>
                        <button
                            type="submit" // Submit the form
                            className="px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
                        >
                            {t('save_button', 'Save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default QuantityModal;