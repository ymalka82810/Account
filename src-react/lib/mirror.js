import { debtStates, isPending, curOf } from './computations.js';

// החיבור בין הקופה לפנקס האישי: כל חוב שיש לי במשפחה (ואצל נוער, גם כל חוב עם חברים) מועתק אוטומטית
// לפנקס, על אותו שם, אותו סכום ואותו תיאור. ההעתקה לכיוון אחד בלבד: חובות שנרשמים בפנקס לא עוברים לקופה,
// כי הפנקס הוא רישום כללי של כל החובות (גם עם מי שלא במשפחה).
// הפונקציה כאן רק בונה את הרשימה מהנתונים שהגיעו מהשרת; השמירה במכשיר ב-notebook.js (setMirror).
//
// entries: הרשומות הפעילות (data.entries או fdata.entries). closed: חובות שלי שכבר נסגרו (data:closedDebts),
// כדי שחוב ששולם יעבור ל"שולמו" ולא ייעלם. רשומה שממתינה לאישור לא מועתקת (היא עוד לא נספרת גם בקופה).
// חוב פתוח מועתק בסכום שנשאר ממנו, וחוב ששולם בסכום המלא שלו.
export function buildMirror({ me, entries, closed = [], nameOf }) {
  const states = debtStates(entries);
  const out = [];
  const seen = new Set();
  const item = (e, amount, paid) => ({
    id: 'm:' + e.id,
    dir: e.from === me ? 'iowe' : 'owed',
    name: nameOf(e.from === me ? e.to : e.from),
    amount, total: e.amount, currency: curOf(e), note: e.note || '', date: e.date, paid,
    // חוב שמוחזר לפי השער ביום ההלוואה: השערים שלו נשמרים, כדי שהסיכום בפנקס יחשב אותו לפיהם.
    ...(e.rateAt === 'loan' && e.fx ? { fx: e.fx } : {}),
  });
  for (const e of entries) {
    if (e.kind !== 'debt' || isPending(e) || (e.from !== me && e.to !== me)) continue;
    const st = states.get(e.id);
    const remaining = st ? Math.round(st.remaining) : e.amount;
    seen.add(e.id);
    out.push({ at: e.createdAt || 0, ...item(e, remaining > 0 ? remaining : e.amount, remaining <= 0) });
  }
  closed.forEach((e, i) => {
    if (seen.has(e.id) || (e.from !== me && e.to !== me)) return;
    out.push({ at: -i, ...item(e, e.amount, true) }); // הרשימה כבר מהחדש לישן
  });
  return out
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
    .map(({ at, ...rest }) => rest);
}
