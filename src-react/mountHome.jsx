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
import FamilyTab from './components/FamilyTab.jsx';
import FriendsTab from './components/FriendsTab.jsx';
import EntriesList from './components/EntriesList.jsx';
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
  const fdata = useQuery('friends:get', token ? { token } : 'skip') || null;
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
  const isTeen = data.me.role === 'teen';
  const friendsBox = isTeen ? document.getElementById('friendsRoot') : null;
  const historyBox = document.getElementById('myHistory');
  const me = data.me.id;
  return (
    <>
      <Home data={data} token={token} openEntryFlow={openEntryFlow} />
      {parentBox && createPortal(<PendingCards data={data} token={token} parentView />, parentBox)}
      {legacyBox && createPortal(<Legacy token={token} />, legacyBox)}
      {codesBox && createPortal(<Codes data={data} token={token} />, codesBox)}
      {recurringBox && createPortal(<Recurring data={data} token={token} />, recurringBox)}
      {isParent && <FamilyTab data={data} fdata={fdata} token={token} />}
      {friendsBox && createPortal(<FriendsTab data={data} fdata={fdata} token={token} />, friendsBox)}
      {historyBox && createPortal(
        <EntriesList list={data.entries.filter((e) => e.from === me || e.to === me)} emptyText="עדיין לא נרשם כלום."
          token={token} me={me} isParent={isParent} lookup={(id) => data.people.find((p) => p.id === id)} debtList={data.entries} />,
        historyBox)}
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
