// נקודת החיבור בין האתר הישן (app.js/session.js) לבין מסך הבית החדש
// ב-React. mountHomeTab() נקראת פעם אחת מ-app.js, ונותנת ל-React לנהל
// את תוכן #reactHomeRoot (שנמצא בתוך <section id="tab-home"> הסטטי).
// מאותו רגע, המסך הזה מתעדכן לבד בכל שינוי נתונים (useQuery), בלי צורך
// בקריאה ידנית ל-renderHome() כמו קודם.
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import PendingCards from './components/PendingCards.jsx';
import Legacy from './components/Legacy.jsx';
import Codes from './components/Codes.jsx';
import Recurring from './components/Recurring.jsx';
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
  // להורים האישורים בראש הסקירה המשפחתית (אלמנט סטטי ב-index.html), דרך portal.
  const isParent = data.me.role === 'parent';
  const at = (id) => (isParent ? document.getElementById(id) : null);
  const parentBox = at('pendingBoxParent');
  const legacyBox = at('legacyBox');
  const codesBox = at('codesBox');
  const recurringBox = at('recurringBox');
  return (
    <>
      <Home data={data} token={token} openEntryFlow={openEntryFlow} />
      {parentBox && createPortal(<PendingCards data={data} token={token} parentView />, parentBox)}
      {legacyBox && createPortal(<Legacy token={token} />, legacyBox)}
      {codesBox && createPortal(<Codes data={data} token={token} />, codesBox)}
      {recurringBox && createPortal(<Recurring data={data} token={token} />, recurringBox)}
    </>
  );
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
