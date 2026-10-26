import { useSyncExternalStore } from 'react';
import { deviceCurrency } from './appIcon.js';

// הפנקס האישי: רשימת "אני חייב / חייבים לי" שנשמרת על המכשיר בלבד.
// בלי משתמש, בלי שרת ובלי סיסמה. תאריך הלידה (אופציונלי) נשמר כאן רק כדי שאפשר
// יהיה לדעת אם מותר להקים קופה משפחתית. הקמה בפועל נבדקת שוב בשרת.
export const NOTEBOOK_KEY = 'kupa-notebook-v1';
export const ADULT_AGE = 18;

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || 'null');
    if (d && Array.isArray(d.entries)) return d;
  } catch (e) { /* פגום: מתחילים מחדש */ }
  return { entries: [], birthDate: '', currency: '' };
};

let data = load();
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => data;

function commit(next) {
  data = next;
  try { localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(data)); } catch (e) { /* אין מקום או מצב פרטי */ }
  listeners.forEach((fn) => fn());
}

export const useNotebook = () => useSyncExternalStore(subscribe, snapshot);

export const notebookCurrency = () => data.currency || deviceCurrency() || 'ILS';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// dir: 'iowe' = אני חייב לו/לה, 'owed' = חייב/ת לי. amount באגורות.
export function addEntry({ dir, name, amount, note, date }) {
  const entry = { id: newId(), dir, name, amount, note, date, paid: false };
  commit({ ...data, currency: data.currency || notebookCurrency(), entries: [entry, ...data.entries] });
}
export const setPaid = (id, paid) =>
  commit({ ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, paid } : e)) });
export const removeEntry = (id) =>
  commit({ ...data, entries: data.entries.filter((e) => e.id !== id) });
export const setBirthDate = (birthDate) => commit({ ...data, birthDate });

// ---------- גיל ----------
// תאריך לידה תקין (YYYY-MM-DD, לא בעתיד, לא לפני 1900), או null.
export function parseBirth(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (y < 1900 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt > new Date() ? null : dt;
}
export function ageOf(iso) {
  const b = parseBirth(iso);
  if (!b) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}
export const isAdult = (iso) => { const a = ageOf(iso); return a !== null && a >= ADULT_AGE; };
