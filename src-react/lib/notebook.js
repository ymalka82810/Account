import { useSyncExternalStore } from 'react';
import { deviceCurrency } from './appIcon.js';
import { normName, nameMatch } from './names.js';

// הפנקס האישי: רשימת "אני חייב / חייבים לי" שנשמרת על המכשיר בלבד.
// בלי משתמש, בלי שרת ובלי סיסמה. תאריך הלידה (אופציונלי) נשמר כאן רק כדי שאפשר
// יהיה לדעת אם מותר להקים קופה משפחתית. הקמה בפועל נבדקת שוב בשרת.
export const NOTEBOOK_KEY = 'kupa-notebook-v1';
export const ADULT_AGE = 18;
// ילד/ה שאישר/ה שההורים יראו את הפנקס שלו/ה (לצפייה בלבד): הפנקס מראה על כך הודעה. נקבע לפי הנתונים מהשרת.
export const NB_SHARED_KEY = 'kupa-notebook-shared';

// הגדרות מראה ורשימה של הפנקס. look: kid = צבעוני, dark = כהה רגוע, neon = ניאון (עם palette).
export const DEFAULT_SETTINGS = { look: 'kid', palette: 'blue', textSize: 'normal', sort: 'new', showPaid: true };
export const TEXT_SCALE = { small: 90, normal: 100, large: 115, xlarge: 130 };

// ---------- שמות ידועים ----------
// כל מי שנרשם בפנקס נשמר כאדם ידוע (people), וכל רישום מצביע עליו (personId).
// כך אפשר לבחור אותו שוב כבעל חוב או כחייב, ושמות דומים אפשר לאחד.
export { normName, nameMatch };

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// בונה את רשימת האנשים מהרישומים הקיימים (מעבר חד-פעמי מנתונים ישנים בלי people).
function withPeople(d) {
  const people = Array.isArray(d.people) ? [...d.people] : [];
  let entries = d.entries;
  const byKey = new Map(people.map((p) => [normName(p.name), p]));
  let changed = !Array.isArray(d.people);
  entries = entries.map((e) => {
    if (e.personId && people.some((p) => p.id === e.personId)) return e;
    const key = normName(e.name);
    let p = byKey.get(key);
    if (!p) { p = { id: newId(), name: e.name }; people.push(p); byKey.set(key, p); }
    changed = true;
    return { ...e, personId: p.id };
  });
  return changed ? { ...d, people, entries } : d;
}

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || 'null');
    if (d && Array.isArray(d.entries)) return withPeople({ birthDate: '', currency: '', ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } });
  } catch (e) { /* פגום: מתחילים מחדש */ }
  return { entries: [], people: [], birthDate: '', currency: '', settings: { ...DEFAULT_SETTINGS } };
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

export const useNotebook = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export const notebookCurrency = () => data.currency || deviceCurrency() || 'ILS';

// dir: 'iowe' = אני חייב לו/לה, 'owed' = חייב/ת לי. amount באגורות.
// personId: אדם ידוע שנבחר. בלי זה, שם זהה (אחרי נירמול) לאדם ידוע משתמש בו, ושם חדש נוצר כאדם חדש.
export function addEntry({ dir, name, amount, note, date, personId }) {
  let people = data.people;
  let person = personId ? people.find((p) => p.id === personId) : people.find((p) => normName(p.name) === normName(name));
  if (!person) { person = { id: newId(), name }; people = [...people, person]; }
  const entry = { id: newId(), dir, name: person.name, personId: person.id, amount, note, date, paid: false };
  commit({ ...data, people, currency: data.currency || notebookCurrency(), entries: [entry, ...data.entries] });
}

// אנשים ידועים, מהאחרון שנרשם אליו (או ממנו) לראשון.
export function knownPeople(nb = data) {
  const last = new Map();
  nb.entries.forEach((e, i) => { if (!last.has(e.personId)) last.set(e.personId, i); }); // הרשימה כבר מהחדש לישן
  return [...nb.people].sort((a, b) => (last.has(a.id) ? last.get(a.id) : 1e9) - (last.has(b.id) ? last.get(b.id) : 1e9));
}

// אנשים ידועים בשם דומה (לא זהה) לשם שהוקלד.
export function similarPeople(name, nb = data) {
  return nb.people.filter((p) => nameMatch(p.name, name) === 'similar');
}

// איחוד שני אנשים ידועים לאחד: כל הרישומים של dropId עוברים אל keepId, והשם הסופי הוא finalName.
export function mergePeople(keepId, dropId, finalName) {
  if (keepId === dropId) return;
  const people = data.people.filter((p) => p.id !== dropId).map((p) => (p.id === keepId ? { ...p, name: finalName } : p));
  const entries = data.entries.map((e) => (e.personId === keepId || e.personId === dropId ? { ...e, personId: keepId, name: finalName } : e));
  commit({ ...data, people, entries });
}

export function renamePerson(id, name) {
  commit({
    ...data,
    people: data.people.map((p) => (p.id === id ? { ...p, name } : p)),
    entries: data.entries.map((e) => (e.personId === id ? { ...e, name } : e)),
  });
}

// הסרת רישומים (נמחקו, או הועברו לקופה המשפחתית). האדם נשאר ברשימת השמות הידועים.
export function removeEntries(ids) {
  const gone = new Set(ids);
  commit({ ...data, entries: data.entries.filter((e) => !gone.has(e.id)) });
}

// החלטות "לא לאחד" מול בני משפחה, כדי לא לשאול שוב ושוב. מפתח: personId + ':' + מזהה בן המשפחה.
export function declineMerge(key) {
  commit({ ...data, declinedMerges: [...(data.declinedMerges || []), key] });
}
export const isMergeDeclined = (key, nb = data) => (nb.declinedMerges || []).includes(key);
export const setPaid = (id, paid) =>
  commit({ ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, paid } : e)) });
export const removeEntry = (id) => removeEntries([id]);
export const setBirthDate = (birthDate) => commit({ ...data, birthDate });
export const setSetting = (key, value) => commit({ ...data, settings: { ...data.settings, [key]: value } });
export const setCurrencyChoice = (currency) => commit({ ...data, currency });
export const clearPaid = () => removeEntries(data.entries.filter((e) => e.paid).map((e) => e.id));
export const clearAll = () => commit({ ...data, entries: [], people: [] });

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
