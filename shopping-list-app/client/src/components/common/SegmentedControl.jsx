// client/src/components/common/SegmentedControl.jsx
import React from 'react';

// --- Segmented Control Component ---
// A reusable component for creating a segmented button group.
// Props:
// - options: Array of { value: string, icon: ReactNode }
// - currentValue: string (The currently selected value)
// - onChange: Function(value: string) (Callback when an option is clicked)
// - ariaLabel: string (Accessibility label for the group)
function SegmentedControl({ options, currentValue, onChange, ariaLabel }) {
    return (
        <div className="inline-flex rounded-lg shadow-sm bg-gray-200 dark:bg-gray-700 p-0.5" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`
                        px-3 py-1 text-sm font-medium rounded-md
                        transition-colors duration-200 ease-in-out
                        focus:z-10 focus:ring-2 focus:ring-offset-1
                        focus:ring-accent dark:focus:ring-dark-accent
                        focus:ring-offset-gray-200 dark:focus:ring-offset-gray-700
                        outline-none
                        flex items-center justify-center
                        h-8 w-10
                        ${currentValue === option.value
                            ? 'bg-white dark:bg-gray-500 shadow' // Styles for the active button
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600' // Styles for inactive buttons
                        }
                    `}
                    aria-pressed={currentValue === option.value} // ARIA attribute for toggle buttons
                >
                    {/* Icon with transition */}
                    <span className={`transition-opacity duration-150 ${currentValue === option.value ? 'opacity-100' : 'opacity-75 hover:opacity-100'}`}>
                        {option.icon}
                    </span>
                </button>
            ))}
        </div>
    );
}

export default SegmentedControl;