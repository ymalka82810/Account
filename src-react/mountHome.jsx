// נקודת החיבור בין האתר הישן (app.js/session.js) לבין מסך הבית החדש
// ב-React. mountHomeTab() נקראת פעם אחת מ-app.js, ונותנת ל-React לנהל
// את תוכן #reactHomeRoot (שנמצא בתוך <section id="tab-home"> הסטטי).
// מאותו רגע, המסך הזה מתעדכן לבד בכל שינוי נתונים (useQuery), בלי צורך
// בקריאה ידנית ל-renderHome() כמו קודם.
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient, ConvexProvider, useQuery } from 'convex/react';
import Home from './components/Home.jsx';

let client = null;

// "חנות" חיצונית קטנה ל-token הנוכחי: session.js קורא ל-notifyTokenChange()
// בכל login/logout (setToken/dropSession), ו-useSyncExternalStore (ה-hook
// הרשמי של React 18 בדיוק למקרה הזה - מידע חי שחי מחוץ ל-React) דואג
// שהקומפוננטה תתעדכן בלי polling.
let currentToken = '';
const listeners = new Set();
export function notifyTokenChange(token) {
  currentToken = token || '';
  listeners.forEach((fn) => fn());
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot() { return currentToken; }

function HomeRoot({ openEntryFlow }) {
  const token = useSyncExternalStore(subscribe, getSnapshot);
  const data = useQuery('data:get', token ? { token } : 'skip');
  // מצבים שבהם אין עדיין מה להציג (טעינה ראשונית / לא מחובר / session
  // ישן) - שאר האתר (מסך welcome/pin/loading) כבר מטפל בהם ברמת הניתוב,
  // אז כאן פשוט לא מציירים כלום, בלי להתנגש.
  if (!token || data === undefined || data === null || data.legacy) return null;
  return <Home data={data} openEntryFlow={openEntryFlow} />;
}

export function mountHomeTab({ initialToken, openEntryFlow }) {
  const el = document.getElementById('reactHomeRoot');
  if (!el) return;
  currentToken = initialToken || '';
  if (!client) client = new ConvexReactClient(window.CONVEX_URL);
  createRoot(el).render(
    <ConvexProvider client={client}>
      <HomeRoot openEntryFlow={openEntryFlow} />
    </ConvexProvider>
  );
}
