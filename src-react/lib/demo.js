// מצב דמו: משפחה לדוגמה שנבנית בדפדפן, בלי שרת ובלי שמירה. הטוקן 'demo' לא נשמר במכשיר,
// ו-api.js עונה לשאילתות מכאן וחוסם כתיבה. סכומים באגורות, כמו בשרת.

export const DEMO_TOKEN = 'demo';
export const isDemo = (token) => token === DEMO_TOKEN;

const iso = (daysAgo) => {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DANA = 'demo-dana', NOA = 'demo-noa', YOAV = 'demo-yoav';

// נועה לקחה 120 ש"ח לאוזניות והחזירה 50. יואב חייב 30 על כרטיס לסרט. אפס חובות אחרים, כדי שהכול יובן במבט.
export function demoData() {
  const person = (id, name, role, avatar, gender) => ({
    id, name, role, avatar, gender, hasPin: true, pinLength: 4, lockAlert: null,
    friendsEnabled: false, friendsRequested: false, friendEmail: null,
  });
  const entry = (id, kind, from, to, amount, note, daysAgo, extra = {}) => ({
    id, kind, from, to, amount, note, currency: 'ILS', fx: null, date: iso(daysAgo),
    createdBy: DANA, createdAt: Date.now() - daysAgo * 86400000, status: 'approved', debtId: null, ...extra,
  });
  return {
    legacy: false,
    me: { id: DANA, name: 'דנה', role: 'parent', avatar: '👩', gender: 'f', palette: 'blue', email: null, pendingEmail: null },
    family: { name: 'משפחת כהן (דמו)', currency: 'ILS', country: 'IL', localeSet: true },
    people: [
      person(DANA, 'דנה', 'parent', '👩', 'f'),
      person(NOA, 'נועה', 'child', '🦊', 'f'),
      person(YOAV, 'יואב', 'child', '🐼', 'm'),
    ],
    joinRequests: [],
    entries: [
      entry('demo-d1', 'debt', NOA, DANA, 12000, 'אוזניות', 12),
      entry('demo-p1', 'payment', NOA, DANA, 5000, 'החזר ראשון', 5, { debtId: 'demo-d1' }),
      entry('demo-d2', 'debt', YOAV, DANA, 3000, 'כרטיס לסרט', 3),
    ],
    recurring: [],
  };
}

// תשובות לשאילתות שהאפליקציה שולחת. כל השאר (חברים, מכשירים, רשימת הורים ישנה) ריק.
export function demoQuery(name) {
  switch (name) {
    case 'data:get': return demoData();
    case 'fx:rates': return { rates: null, fetchedAt: Date.now() };
    case 'auth:listDevices': return [];
    default: return null;
  }
}
