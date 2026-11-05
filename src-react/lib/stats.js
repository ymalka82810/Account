// סיכומים לגרפים ולסיכום החודשי (הורים). הכול מחושב בדפדפן מהרשומות הפעילות שכבר נשלחו,
// בשווי המטבע הראשי. רשומות שממתינות לאישור לא נספרות, וגם לא רשומות שאי אפשר להמיר (אין שער).
// חוב שנסגר לגמרי ועבר לארכיון (ledger.ts) לא נכלל בסכומי החודשים, אבל חובות פתוחים תמיד שלמים.

import { baseCurrency, convert, curOf, debtStates, isPending } from './computations.js';

export const monthKey = (iso) => iso.slice(0, 7); // YYYY-MM

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// סך חובות חדשים והחזרים שנרשמו בחודש (לפי תאריך הרשומה), במטבע הראשי.
export function monthTotals(entries, key) {
  let debts = 0, payments = 0, count = 0;
  for (const e of entries) {
    if (isPending(e) || monthKey(e.date) !== key) continue;
    const v = convert(e.amount, curOf(e), baseCurrency());
    if (v === null) continue;
    count++;
    if (e.kind === 'debt') debts += v; else payments += v;
  }
  return { debts: Math.round(debts), payments: Math.round(payments), count };
}

// n החודשים שמסתיימים ב-endKey, מהישן לחדש.
export function lastMonths(entries, endKey, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftMonth(endKey, -i);
    out.push({ key, ...monthTotals(entries, key) });
  }
  return out;
}

const daysBetween = (fromIso, toIso) => {
  const a = fromIso.split('-').map(Number), b = toIso.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000));
};

// מי חייב הכי הרבה: סך החובות הפתוחים של כל אדם (לכל הנושים), ומאז מתי החוב הפתוח הוותיק ביותר.
export function topDebtors(entries, today = todayIso()) {
  const by = new Map();
  for (const st of debtStates(entries).values()) {
    if (st.remaining <= 0) continue;
    const v = convert(st.remaining, st.cur, baseCurrency());
    if (v === null) continue;
    const row = by.get(st.debt.from) || { id: st.debt.from, amount: 0, oldest: st.debt.date };
    row.amount += v;
    if (st.debt.date < row.oldest) row.oldest = st.debt.date;
    by.set(st.debt.from, row);
  }
  return [...by.values()]
    .map((r) => ({ id: r.id, amount: Math.round(r.amount), since: r.oldest, days: daysBetween(r.oldest, today) }))
    .filter((r) => r.amount > 0)
    .sort((x, y) => y.amount - x.amount || y.days - x.days);
}

// ---------- הישגים ----------
const MAX_WEEKS = 12; // כמה שבועות אחורה בודקים רצף
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// סוף השבוע (שבת) של התאריך.
const weekEnd = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return addDays(iso, 6 - new Date(Date.UTC(y, m - 1, d)).getUTCDay());
};

// כמה שבועות ברצף (עד היום) לאדם לא היה אף חוב פתוח. שבוע נספר רק אם כבר היה לו חוב קודם,
// כדי שמי שמעולם לא חב לא יקבל רצף. השבוע הנוכחי נבדק לפי היום.
export function cleanWeekStreak(entries, personId, today = todayIso()) {
  const firstDebt = entries.filter((e) => e.kind === 'debt' && e.from === personId && !isPending(e))
    .reduce((min, e) => (e.date < min ? e.date : min), '9999-12-31');
  let streak = 0;
  for (let i = 0; i < MAX_WEEKS; i++) {
    const end = addDays(weekEnd(today), -7 * i);
    const asOf = end > today ? today : end;
    if (firstDebt > asOf) break;
    const upTo = entries.filter((e) => e.date <= asOf);
    const open = [...debtStates(upTo).values()].some((st) => st.debt.from === personId && st.remaining > 0);
    if (open) break;
    streak++;
  }
  return streak;
}

// ההישגים של אדם: earned = הושג, ו-progress/goal להצגת התקדמות בהישגי הרצף.
export function achievementsOf(personId, entries, goals = [], today = todayIso()) {
  const streak = cleanWeekStreak(entries, personId, today);
  const repaid = entries.some((e) => e.kind === 'payment' && e.from === personId && !isPending(e));
  const goalDone = goals.some((x) => x.personId === personId && x.saved >= x.target);
  return [
    { id: 'firstRepay', icon: '🌱', earned: repaid },
    { id: 'streak1', icon: '⭐', earned: streak >= 1, progress: Math.min(streak, 1), goal: 1 },
    { id: 'streak3', icon: '🔥', earned: streak >= 3, progress: Math.min(streak, 3), goal: 3 },
    { id: 'streak8', icon: '🏆', earned: streak >= 8, progress: Math.min(streak, 8), goal: 8 },
    { id: 'goalDone', icon: '🎯', earned: goalDone },
  ];
}
