// חישובי חובות ויתרות: כל פונקציה
// מקבלת את ה-state כפרמטר במקום לקרוא למודול גלובלי. כך React יכול להריץ
// מחדש אוטומטית בכל שינוי ב-data (ללא קריאות renderX ידניות).

export const isPending = (e) => e.status === 'pending';

export function pairOwes(a, b, entries) {
  let sum = 0;
  for (const e of entries) {
    if (isPending(e)) continue;
    const sign = e.kind === 'debt' ? 1 : -1;
    if (e.from === a && e.to === b) sum += sign * e.amount;
    else if (e.from === b && e.to === a) sum -= sign * e.amount;
  }
  return sum;
}

export function debtStates(entries) {
  const byId = new Map();
  const order = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
  const debts = entries.filter((e) => e.kind === 'debt' && !isPending(e)).sort(order);
  for (const d of debts) byId.set(d.id, { debt: d, paid: 0, remaining: d.amount });
  for (const e of entries) {
    if (e.kind !== 'payment' || isPending(e) || !e.debtId) continue;
    const st = byId.get(e.debtId);
    if (st) { st.paid += e.amount; st.remaining = Math.max(0, st.debt.amount - st.paid); }
  }
  for (const e of [...entries].sort(order)) {
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

export function openDebtsOf(a, b, entries) {
  return [...debtStates(entries).values()]
    .filter((x) => x.debt.from === a && x.debt.to === b && x.remaining > 0)
    .sort((x, y) => x.debt.date.localeCompare(y.debt.date) || x.debt.createdAt - y.debt.createdAt);
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export const debtLabel = (d) => (d.note || 'חוב') + ' • ' + fmtDate(d.date);

export const money = (agorot) => (agorot / 100).toLocaleString('he-IL', { style: 'currency', currency: 'ILS' });

export const roleLabel = (r) => (r === 'parent' ? 'הורה' : r === 'teen' ? 'נער/ה' : 'ילד/ה');

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
  const nameOf = (id) => lookup(id)?.name ?? 'לא ידוע';
  return {
    nameOf,
    subjectWord: (id) => (id === me ? 'אני' : nameOf(id)),
    toWord: (id) => (id === me ? 'לי' : 'ל' + nameOf(id)),
  };
}

export const canDelete = (e, me, isParent) =>
  isParent || (e.createdBy === me && (isPending(e) || Date.now() - e.createdAt < 10 * 60 * 1000));
