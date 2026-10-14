// נקודת כניסה חדשה ל-React. עדיין לא מחוברת לאתר החי (index.html), אבל
// עכשיו כן מתחברת ל-Convex האמיתי (אותה כתובת production מ-config.js),
// כדי לוודא שתבנית ה-useQuery עובדת מול שרת אמיתי לפני שמחליפים את
// המסך בתוך האתר החי. ה-token מגיע מ-localStorage (אותו מפתח 'kupa-token'
// שהאתר הישן שומר) - אם מישהו כבר מחובר באתר הישן באותו דפדפן, ה-preview
// הזה יראה אותם נתונים אמיתיים, read-only (useQuery לא כותב כלום).
import { createRoot } from 'react-dom/client';
import { ConvexReactClient, ConvexProvider, useQuery } from 'convex/react';
import Home from './components/Home.jsx';

const client = new ConvexReactClient(window.CONVEX_URL);

function AppInner() {
  const token = localStorage.getItem('kupa-token') || '';
  const data = useQuery('data:get', { token });

  if (!token) {
    return <p style={{ padding: 16 }}>
      אין session פעיל בדפדפן הזה (לא מחובר דרך האתר הישן). זה תקין -
      ה-query עצמו הגיע לשרת ה-Convex האמיתי בהצלחה והחזיר "אין נתונים",
      בדיוק כמו שהיה קורה באתר הישן למשתמש לא מחובר.
    </p>;
  }
  if (data === undefined) return <p style={{ padding: 16 }}>טוען…</p>;
  if (data === null || data.legacy) return <p style={{ padding: 16 }}>Session לא תקין.</p>;

  const openEntryFlow = (opts) => alert('openEntryFlow (עדיין לא מחובר):\n' + JSON.stringify(opts, null, 2));
  return <Home data={data} openEntryFlow={openEntryFlow} />;
}

function App() {
  return (
    <ConvexProvider client={client}>
      <AppInner />
    </ConvexProvider>
  );
}

const rootEl = document.getElementById('react-root');
if (rootEl) createRoot(rootEl).render(<App />);
