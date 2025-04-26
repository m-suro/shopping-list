// client/src/components/common/LanguageToggle.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

// Import the reusable SegmentedControl component
import SegmentedControl from './SegmentedControl';

// --- Language Toggle Component ---
// Provides a segmented control for switching between languages.
// Props:
// - currentLang: string (The currently active language code, e.g., 'en' or 'pl')
// - onChangeLang: Function(lang: string) (Callback when language is changed)
function LanguageToggle({ currentLang, onChangeLang }) {
    const { t } = useTranslation();

    // Define the options for the segmented control
    // Using image flags as icons
    const languageOptions = [
        {
            value: 'en', // Value for English
            icon: <img src="/USA.png" alt="USA Flag" className="w-5 h-auto" /> // Icon for English
        },
        {
            value: 'pl', // Value for Polish
            icon: <img src="/Poland.png" alt="Poland Flag" className="w-5 h-auto" /> // Icon for Polish
        }
    ];

    return (
        <SegmentedControl
            options={languageOptions}
            currentValue={currentLang} // Pass the current language code as the value
            onChange={onChangeLang} // Pass the onChangeLang function directly
            ariaLabel={t('language_toggle_aria_label')} // Accessibility label
        />
    );
}

export default LanguageToggle;