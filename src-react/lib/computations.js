// חישובי חובות ויתרות: כל פונקציה
// מקבלת את ה-state כפרמטר במקום לקרוא למודול גלובלי. כך React יכול להריץ
// מחדש אוטומטית בכל שינוי ב-data (ללא קריאות renderX ידניות).

import { g } from './gender.js';
import { t, intlLocale } from '../i18n/index.js';

export const isPending = (e) => e.status === 'pending';

// ---------- מטבעות ושערי המרה ----------
// App קובע את המטבע הראשי של המשפחה ואת השערים (setFx) לפני שהמסכים מצוירים.
// רשומה בלי currency היא בשקלים (גם רשומות חברים).
let FX = { base: 'ILS', rates: null };
export function setFx(base, rates) { FX = { base: base || 'ILS', rates: rates || null }; }
export const baseCurrency = () => FX.base;
export const hasRates = () => !!FX.rates;
export const curOf = (e) => e.currency || 'ILS';

// rates[X] = כמה X שווה דולר אחד. null אם אין שער.
export function convert(amount, from, to, rates = FX.rates) {
  if (from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return null;
  return (amount * rates[to]) / rates[from];
}
// שער: כמה יחידות של to שווה יחידה אחת של from.
export const rateOf = (from, to, rates) => convert(1, from, to, rates);

const EPS = 0.5; // פחות מחצי אגורה/סנט = שולם

// חלוקת ההחזרים על החובות. החזר שמקושר לחוב הולך אליו; החזר כללי מתחלק על החובות
// באותו כיוון מהישן לחדש. חוב במטבע אחר מקבל את ההחזר לפי השער שנשמר בהחזר (e.fx).
// מחזיר את מצב כל חוב (במטבע שלו) ואת מה שנשאר מכל החזר אחרי החלוקה.
function ledger(entries) {
  const byId = new Map();
  const leftovers = [];
  const order = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
  const debts = entries.filter((e) => e.kind === 'debt' && !isPending(e)).sort(order);
  for (const d of debts) byId.set(d.id, { debt: d, cur: curOf(d), paid: 0, remaining: d.amount });
  const pays = entries.filter((e) => e.kind === 'payment' && !isPending(e)).sort(order);
  // קודם ההחזרים המקושרים, אחר כך הכלליים.
  for (const e of pays) {
    if (!e.debtId) continue;
    const st = byId.get(e.debtId);
    if (!st) { leftovers.push({ e, left: e.amount }); continue; }
    const r = rateOf(st.cur, curOf(e), e.fx || FX.rates); // כמה מטבע-החזר ליחידת חוב
    if (r === null) continue;
    const used = Math.min(st.remaining, e.amount / r);
    st.paid += used; st.remaining -= used;
    if (st.remaining < EPS) st.remaining = 0;
    const left = e.amount - used * r;
    if (left >= 1) leftovers.push({ e, left });
  }
  for (const e of pays) {
    if (e.debtId) continue;
    let left = e.amount;
    for (const d of debts) {
      if (left < EPS) break;
      if (d.from !== e.from || d.to !== e.to) continue;
      const st = byId.get(d.id);
      if (st.remaining <= 0) continue;
      const r = rateOf(st.cur, curOf(e), e.fx || FX.rates);
      if (r === null) continue;
      const take = Math.min(left, st.remaining * r);
      st.paid += take / r; st.remaining -= take / r; left -= take;
      if (st.remaining < EPS) st.remaining = 0;
    }
    if (left >= 1) leftovers.push({ e, left });
  }
  return { byId, leftovers };
}

export const debtStates = (entries) => ledger(entries).byId;

// חובות פתוחים מ-a ל-b מקובצים לפי מטבע: {USD: 5000, ILS: 3000} (במטבע של כל קבוצה).
export function totalsByCurrency(a, b, entries) {
  const out = {};
  for (const st of debtStates(entries).values()) {
    if (st.debt.from !== a || st.debt.to !== b || st.remaining <= 0) continue;
    out[st.cur] = (out[st.cur] || 0) + st.remaining;
  }
  for (const c of Object.keys(out)) { out[c] = Math.round(out[c]); if (out[c] <= 0) delete out[c]; }
  return out;
}

// האם יש בין a ל-b (בכיוון הזה) חוב פתוח במטבע שאינו מטבע התצוגה.
export const hasForeignOpen = (a, b, entries, display = FX.base) =>
  Object.keys(totalsByCurrency(a, b, entries)).some((c) => c !== display);

// רשומה זמנית (לא נשמרת) כדי לחשב איך ייראו היתרות אחרי הפעולה.
export const draftEntry = (e) => ({
  id: '__draft', status: 'approved', date: '9999-12-31', createdAt: Number.MAX_SAFE_INTEGER, createdBy: null, fx: FX.rates, ...e,
});

// כמה a חייב ל-b, במטבע התצוגה (ברירת מחדל: המטבע הראשי). חובות במטבע אחר מומרים לפי השער הנוכחי.
export function pairOwes(a, b, entries, display = FX.base) {
  const { byId, leftovers } = ledger(entries);
  let sum = 0;
  for (const st of byId.values()) {
    if (st.remaining <= 0) continue;
    const sign = st.debt.from === a && st.debt.to === b ? 1 : st.debt.from === b && st.debt.to === a ? -1 : 0;
    if (!sign) continue;
    const v = convert(st.remaining, st.cur, display);
    if (v !== null) sum += sign * v;
  }
  for (const { e, left } of leftovers) {
    // החזר שלא כיסה חוב: מי ששילם "בעודף" - מגיע לו.
    const sign = e.from === a && e.to === b ? -1 : e.from === b && e.to === a ? 1 : 0;
    if (!sign) continue;
    const v = convert(left, curOf(e), display);
    if (v !== null) sum += sign * v;
  }
  return Math.round(sum);
}

// חובות פתוחים מ-a ל-b. remaining = במטבע החוב (מעוגל), value = השווי במטבע התצוגה עכשיו.
export function openDebtsOf(a, b, entries, display = FX.base) {
  return [...debtStates(entries).values()]
    .filter((x) => x.debt.from === a && x.debt.to === b && x.remaining > 0)
    .map((x) => {
      const v = convert(x.remaining, x.cur, display);
      return { ...x, paid: Math.round(x.paid), remaining: Math.round(x.remaining), value: v === null ? 0 : Math.round(v), valueCur: display, foreign: x.cur !== display };
    })
    .filter((x) => x.remaining > 0)
    .sort((x, y) => x.debt.date.localeCompare(y.debt.date) || x.debt.createdAt - y.debt.createdAt);
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export const debtLabel = (d) => (d.note || t('חוב')) + ' • ' + fmtDate(d.date);

export const money = (amount, currency = FX.base) =>
  (amount / 100).toLocaleString(intlLocale(), { style: 'currency', currency });

// מה נשאר מחוב פתוח (פריט מ-openDebtsOf): "נשאר $50 מתוך $100 (≈ ₪185)".
export function debtLeftText(x) {
  const rem = money(x.remaining, x.cur);
  const base = x.paid > 0 ? t('נשאר {left} מתוך {total}', { left: rem, total: money(x.debt.amount, x.cur) }) : rem;
  return x.foreign && x.value ? `${base} (≈ ${money(x.value, x.valueCur)})` : base;
}

// "$100 (≈ ₪370)": סכום במטבע שלו, ואם הוא לא המטבע הראשי - גם השווי הנוכחי.
export function moneyWithValue(amount, currency, display = FX.base) {
  const s = money(amount, currency);
  if (currency === display) return s;
  const v = convert(amount, currency, display);
  return v === null ? s : `${s} (≈ ${money(Math.round(v), display)})`;
}

export const roleLabel = (r, gender) =>
  r === 'parent' ? t('הורה') : r === 'teen' ? g(gender, 'נער', 'נערה', 'נער/ה') : g(gender, 'ילד', 'ילדה', 'ילד/ה');

// כמה כל אחד חייב / מגיע לו, לפי כל החובות הפתוחים (גרסת React של openDebts).
export function openDebts(people, entries) {
  const out = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const n = pairOwes(people[i].id, people[j].id, entries);
      if (n > 0) out.push({ debtor: people[i].id, creditor: people[j].id, amount: n });
      else if (n < 0) out.push({ debtor: people[j].id, creditor: people[i].id, amount: -n });
    }
  }
  return out.sort((x, y) => y.amount - x.amount);
}

// פונקציות שמות שתלויות ב"מי אני" ובמי שאפשר לחפש לפיו (people של המשפחה,
// ובמצב חברים גם fdata.people).
export function namesFor(me, lookup) {
  // הורה עם מגדר מוגדר מוצג כ"אבא"/"אימא" ולא בשם הפרטי שלו/ה.
  const nameOf = (id) => {
    const p = lookup(id);
    if (!p) return t('לא ידוע');
    if (p.role === 'parent' && (p.gender === 'male' || p.gender === 'female')) return p.gender === 'male' ? t('אבא') : t('אימא');
    return p.name;
  };
  const genderOf = (id) => lookup(id)?.gender;
  return {
    nameOf,
    genderOf,
    // בוחר צורת פנייה (זכר/נקבה/כפולה) לפי המגדר של מי שמזוהה/ת ב-id.
    gw: (id, male, female, neutral, params) => g(genderOf(id), male, female, neutral, params),
    // "X חייב/ת ל-Y" ו-"X החזיר/ה ל-Y" כמשפט שלם. אי אפשר להרכיב אותם ממילים, כי סדר המילים
    // והנטייה (גוף, מגדר) שונים בין שפות, ולכן לכל צירוף (אני/אחר) יש נוסח משלו.
    owesLine: (from, to) => (from === me
      ? g(genderOf(from), 'אני חייב ל{to}', 'אני חייבת ל{to}', 'אני חייב/ת ל{to}', { to: nameOf(to) })
      : to === me
        ? g(genderOf(from), '{from} חייב לי', '{from} חייבת לי', '{from} חייב/ת לי', { from: nameOf(from) })
        : g(genderOf(from), '{from} חייב ל{to}', '{from} חייבת ל{to}', '{from} חייב/ת ל{to}', { from: nameOf(from), to: nameOf(to) })),
    repaidLine: (from, to) => (from === me
      ? t('החזרתי ל{to}', { to: nameOf(to) })
      : to === me
        ? g(genderOf(from), '{from} החזיר לי', '{from} החזירה לי', '{from} החזיר/ה לי', { from: nameOf(from) })
        : g(genderOf(from), '{from} החזיר ל{to}', '{from} החזירה ל{to}', '{from} החזיר/ה ל{to}', { from: nameOf(from), to: nameOf(to) })),
  };
}

export const canDelete = (e, me, isParent) =>
  isParent || (e.createdBy === me && (isPending(e) || Date.now() - e.createdAt < 10 * 60 * 1000));
