// client/src/main.jsx
import React, { Suspense } from 'react'; // Import Suspense
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // Ensure Tailwind styles are imported
import './i18n'; // Import the i18n configuration

// Simple loading fallback component
function LoadingFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      Loading...
    </div>
  );
}


ReactDOM.createRoot(document.getElementById('root')).render(
  // Wrap App with Suspense for loading translations
  <Suspense fallback={<LoadingFallback />}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </Suspense>,
);