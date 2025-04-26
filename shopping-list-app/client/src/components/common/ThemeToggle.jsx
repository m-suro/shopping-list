// client/src/components/common/ThemeToggle.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

// Import the reusable SegmentedControl component
import SegmentedControl from './SegmentedControl';

// --- Theme Toggle Component ---
// Provides a segmented control for switching between light and dark themes.
// Props:
// - isDarkMode: boolean (Current theme state)
// - onToggle: Function(isDark: boolean) (Callback when theme is toggled)
function ThemeToggle({ isDarkMode, onToggle }) {
    const { t } = useTranslation();

    // Define the options for the segmented control
    const themeOptions = [
        {
            value: 'light', // Value when light mode is selected
            icon: <span className="material-symbols-rounded text-lg leading-none">light_mode</span> // Icon for light mode
        },
        {
            value: 'dark', // Value when dark mode is selected
            icon: <span className="material-symbols-rounded text-lg leading-none">dark_mode</span> // Icon for dark mode
        }
    ];

    return (
        <SegmentedControl
            options={themeOptions}
            currentValue={isDarkMode ? 'dark' : 'light'} // Map boolean state to 'dark' or 'light' value
            onChange={(value) => onToggle(value === 'dark')} // Map 'dark'/'light' value back to boolean
            ariaLabel={t('theme_toggle_aria_label')} // Accessibility label
        />
    );
}

export default ThemeToggle;