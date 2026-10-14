// נקודת כניסה חדשה ל-React. בשלב הזה היא לא מחוברת לאתר החי —
// מטרתה רק לוודא שתהליך ה-build (Vite) עובד תקין לפני שמתחילים
// להעביר מסכים אמיתיים מה-vanilla app.
import { createRoot } from 'react-dom/client';

function App() {
  return <div style={{ padding: 20, fontFamily: 'sans-serif' }}>React app scaffold — בבנייה.</div>;
}

const rootEl = document.getElementById('react-root');
if (rootEl) createRoot(rootEl).render(<App />);
