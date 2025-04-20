// client/src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend'; // Loads translations using http

i18n
  // Load translations using http -> see /public/locales
  // Learn more: https://github.com/i18next/i18next-http-backend
  .use(HttpApi)
  // Detect user language
  // Learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // Init i18next
  // For all options read: https://www.i18next.com/overview/configuration-options
  .init({
    supportedLngs: ['en', 'pl'], // Supported languages
    fallbackLng: 'en', // Fallback language if detection fails
    debug: true, // Set to false in production
    detection: {
      // Order and from where user language should be detected
      order: ['localStorage', 'navigator'],
      // Cache user language selection in localStorage
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    backend: {
       // Path where resources get loaded from, relative to public folder
       loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  });

export default i18n;