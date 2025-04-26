// client/src/components/Login.jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- Login Component ---
// Handles user login with username and PIN.
function Login({ onLogin, error, setError }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Get the API URL from environment variables
    const API_URL = import.meta.env.VITE_SERVER_URL;

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic input validation
        if (!username || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            setError(t('login_invalid_input'));
            return;
        }

        setIsLoading(true); // Indicate loading state
        setError(null); // Clear previous errors

        try {
            // Send login request to the server API
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin }),
                credentials: 'include' // Include cookies for session management
            });

            const data = await res.json(); // Parse the JSON response

            // Check if the response was successful
            if (!res.ok) {
                // Handle server-side errors (e.g., invalid credentials)
                console.error("Login API failed:", data.message, "Status:", res.status);
                throw new Error(data.message || t('login_failed_generic'));
            }

            // If successful, call the onLogin prop with user data
            console.log("Login successful:", data.user.username);
            onLogin(data);

        } catch (err) {
            // Handle network errors or errors thrown from the response check
            console.error("Login caught error:", err);
            setError(err.message || t('login_failed_generic'));
        } finally {
            // Always turn off loading state
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4">
            <div className="w-full max-w-xs p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6 text-center text-primary dark:text-dark-primary">{t('login_title')}</h1>

                {/* Display login error message if present */}
                {error && (
                    <p className="mb-4 text-center text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-2 rounded text-sm">
                        {error}
                    </p>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('username_label')}
                        </label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase())} // Convert username to lowercase
                            required
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                            autoCapitalize="none" // Prevent auto-capitalization
                            autoComplete="username" // Hint for browser autocomplete
                        />
                    </div>

                    <div className="mb-6">
                        <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('pin_label')}
                        </label>
                        <input
                            type="password"
                            id="pin"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g,''))} // Allow only digits
                            required
                            maxLength="4"
                            minLength="4"
                            inputMode="numeric" // Optimize keyboard for numeric input
                            pattern="\d{4}" // Require exactly 4 digits
                            className="w-full p-2 border rounded bg-white dark:bg-gray-700 text-text dark:text-dark-text border-primary dark:border-dark-primary focus:ring-accent dark:focus:ring-dark-accent"
                             autoComplete="current-password" // Hint for browser autocomplete
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading} // Disable button while loading
                        className="w-full px-4 py-2 rounded bg-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center"
                    >
                        {/* Show spinner if loading, otherwise show button text */}
                        {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : t('login_button')}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;