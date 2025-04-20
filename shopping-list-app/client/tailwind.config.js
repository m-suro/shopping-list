/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scan all JS/TS/JSX files in src
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
       // Define your custom colors here
      colors: {
        // Light theme colors (use as default)
        text: '#062d10',
        background: '#e9fced',
        primary: '#107a2c',
        secondary: '#66ebbc',
        accent: '#1cd9a3',

        // Dark theme colors (prefix with 'dark-')
        'dark-text': '#d2f9dc',
        'dark-background': '#031607',
        'dark-primary': '#85efa1',
        'dark-secondary': '#14996b',
        'dark-accent': '#26e3ad',
      }
    },
  },
  plugins: [],
}