import { state } from './state.js';
import { fmtDate } from './helpers.js';

// ---------- חישובים ----------
export const person = (id) => (state.data
  ? (state.data.people.find((p) => p.id === id) || (state.fdata && state.fdata.people && state.fdata.people[id]) || null)
  : null);
export const isMe = (id) => !!state.data && id === state.data.me.id;
export const isParent = () => !!state.data && state.data.me.role === 'parent';
export const isTeen = () => !!state.data && state.data.me.role === 'teen';
export const roleLabel = (r) => (r === 'parent' ? 'הורה' : r === 'teen' ? 'נער/ה' : 'ילד/ה');
export const nameOf = (id) => (person(id) ? person(id).name : 'לא ידוע');
export const subjectWord = (id) => (isMe(id) ? 'אני' : nameOf(id));
export const toWord = (id) => (isMe(id) ? 'לי' : 'ל' + nameOf(id));

// רשומה שילד/ה יצר/ה וממתינה לאישור הורה. היא לא נספרת ביתרות.
export const isPending = (e) => e.status === 'pending';

// כמה a חייב ל-b (יכול להיות שלילי)
export function pairOwes(a, b, list = state.data.entries) {
  let sum = 0;
  for (const e of list) {
    if (isPending(e)) continue;
    const sign = e.kind === 'debt' ? 1 : -1;
    if (e.from === a && e.to === b) sum += sign * e.amount;
    else if (e.from === b && e.to === a) sum -= sign * e.amount;
  }
  return sum;
}

export function openDebts() {
  const out = [];
  const ps = state.data.people;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const n = pairOwes(ps[i].id, ps[j].id);
      if (n > 0) out.push({ debtor: ps[i].id, creditor: ps[j].id, amount: n });
      else if (n < 0) out.push({ debtor: ps[j].id, creditor: ps[i].id, amount: -n });
    }
  }
  return out.sort((x, y) => y.amount - x.amount);
}

// מצב כל חוב: כמה שולם וכמה נשאר. החזר שקשור לחוב (debtId) מקטין אותו ישירות.
// החזרים כלליים (בלי debtId) מנוכים מהחובות הישנים ביותר באותו כיוון.
export function debtStates(list = state.data.entries) {
  const byId = new Map();
  const order = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
  const debts = list.filter((e) => e.kind === 'debt' && !isPending(e)).sort(order);
  for (const d of debts) byId.set(d.id, { debt: d, paid: 0, remaining: d.amount });
  for (const e of list) {
    if (e.kind !== 'payment' || isPending(e) || !e.debtId) continue;
    const st = byId.get(e.debtId);
    if (st) { st.paid += e.amount; st.remaining = Math.max(0, st.debt.amount - st.paid); }
  }
  for (const e of [...list].sort(order)) {
    if (e.kind !== 'payment' || isPending(e) || e.debtId) continue;
    let left = e.amount;
    for (const d of debts) {
      if (left <= 0) break;
      if (d.from !== e.from || d.to !== e.to) continue;
      const st = byId.get(d.id);
      const take = Math.min(left, st.remaining);
      st.paid += take; st.remaining -= take; left -= take;
    }
  }
  return byId;
}

// חובות פתוחים של a ל-b (מה שעוד נשאר), מהישן לחדש.
export function openDebtsOf(a, b, list = state.data.entries) {
  return [...debtStates(list).values()]
    .filter((x) => x.debt.from === a && x.debt.to === b && x.remaining > 0)
    .sort((x, y) => x.debt.date.localeCompare(y.debt.date) || x.debt.createdAt - y.debt.createdAt);
}

export const debtLabel = (d) => (d.note || 'חוב') + ' • ' + fmtDate(d.date);

export const canDelete = (e) => isParent()
  || (e.createdBy === state.data.me.id && (isPending(e) || Date.now() - e.createdAt < 10 * 60 * 1000));

// ---------- ממתין לאישור / תיבה נכנסת ----------
export const friendRequests = () => (isParent() ? state.data.people.filter((p) => p.friendsRequested) : []);
export const teenRequests = () => (isParent() ? state.data.people.filter((p) => p.teenRequested) : []);
export const parentPendingCount = () => state.data.entries.filter(isPending).length + friendRequests().length + teenRequests().length;

export const friendList = () => (state.fdata && state.fdata.kind === 'teen' && state.fdata.enabled
  ? state.fdata.friendships.filter((f) => f.status === 'accepted').map((f) => state.fdata.people[f.other]).filter(Boolean)
  : []);
export const friendsInboxCount = () => (state.fdata && state.fdata.kind === 'teen' && state.fdata.enabled
  ? state.fdata.friendships.filter((f) => f.status === 'pending' && f.incoming).length
    + state.fdata.entries.filter((e) => isPending(e) && e.createdBy !== state.data.me.id).length
  : 0);
