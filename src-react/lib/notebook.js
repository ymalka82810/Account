import { useSyncExternalStore } from 'react';
import { deviceCurrency } from './appIcon.js';
import { normName, nameMatch, topPeople, searchPeople } from './names.js';

// הפנקס האישי: רשימת "אני חייב / חייבים לי" שנשמרת על המכשיר בלבד.
// בלי משתמש, בלי שרת ובלי סיסמה. חובות מהקופה המשפחתית ומהחברים מועתקים אליו אוטומטית (mirror, בהמשך הקובץ). תאריך הלידה (אופציונלי) נשמר כאן רק כדי שאפשר
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
export { normName, nameMatch, topPeople, searchPeople };

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

// ---------- חובות מהמשפחה ומהחברים (העתק אוטומטי) ----------
// mirror = { [key]: { kind: 'family' | 'friends', person, label, entries: [...] } }. key לכל משפחה ('fam:<id>')
// ולחובות החברים שלה ('fr:<id>'). הרשימה נבנית ב-mirror.js מנתוני השרת בכל כניסה ובכל שינוי, ונשמרת כאן כדי
// שהפנקס יציג אותה גם בלי כניסה ובלי חיבור. היא נפרדת מ-entries בכוונה: היא לקריאה בלבד בפנקס (משנים אותה
// בקופה), לא נשלחת בעותק שההורים רואים (הם רואים את הקופה ממילא, ומשפחה אחת לא רואה חובות של האחרת),
// ולא משתתפת בקיזוז, באיחוד שמות ובמחיקה. לכל משפחה נשמר אדם אחד: מי שנכנס אליה אחרון מהמכשיר הזה.
const validMirror = (m) => {
  const out = {};
  if (m && typeof m === 'object') {
    for (const [key, grp] of Object.entries(m)) if (grp && Array.isArray(grp.entries)) out[key] = grp;
  }
  return out;
};

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || 'null');
    if (d && Array.isArray(d.entries)) return withPeople({ birthDate: '', currency: '', ...d, mirror: validMirror(d.mirror), settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } });
  } catch (e) { /* פגום: מתחילים מחדש */ }
  return { entries: [], people: [], mirror: {}, birthDate: '', currency: '', settings: { ...DEFAULT_SETTINGS } };
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

// מחליף את ההעתק של מקור אחד (משפחה או חברים). בלי שינוי בתוכן לא נשמר כלום, כדי שלא יהיו רינדורים מיותרים.
export function setMirror(key, group) {
  const prev = (data.mirror || {})[key];
  if (prev && JSON.stringify(prev) === JSON.stringify(group)) return;
  commit({ ...data, mirror: { ...(data.mirror || {}), [key]: group } });
}
// מסיר את ההעתק של מקור (יצאת מהמשפחה, הקופה נמחקה, מצב חברים כובה).
export function dropMirror(key) {
  if (!data.mirror || !(key in data.mirror)) return;
  const { [key]: gone, ...rest } = data.mirror;
  commit({ ...data, mirror: rest });
}
// כל מה שהועתק ממשפחה אחת (הקופה וחובות החברים שלה).
export function dropFamilyMirror(familyId) {
  dropMirror('fam:' + familyId);
  dropMirror('fr:' + familyId);
}
// שערי ההמרה האחרונים שהגיעו מהשרת, כדי שהסיכום בפנקס יחשב חוב במטבע אחר גם בלי חיבור.
export function setMirrorRates(rates) {
  if (!rates || JSON.stringify(data.mirrorRates || null) === JSON.stringify(rates)) return;
  commit({ ...data, mirrorRates: rates });
}
// כל החובות המועתקים, עם המקור שלהם (src: 'family' | 'friends', label: שם המשפחה).
export const mirrorEntries = (nb = data) => Object.values(nb.mirror || {})
  .flatMap((grp) => grp.entries.map((e) => ({ ...e, src: grp.kind, label: grp.label || '' })));

export const notebookCurrency = () => data.currency || deviceCurrency() || 'USD';

// dir: 'iowe' = אני חייב לו/לה, 'owed' = חייב/ת לי. amount באגורות.
// personId: אדם ידוע שנבחר. בלי זה, שם זהה (אחרי נירמול) לאדם ידוע משתמש בו, ושם חדש נוצר כאדם חדש.
export function addEntry({ dir, name, amount, note, date, personId }) {
  let people = data.people;
  let person = personId ? people.find((p) => p.id === personId) : people.find((p) => normName(p.name) === normName(name));
  if (!person) { person = { id: newId(), name }; people = [...people, person]; }
  const entry = { id: newId(), dir, name: person.name, personId: person.id, amount, note, date, paid: false };
  commit({ ...data, people, currency: data.currency || notebookCurrency(), entries: [entry, ...data.entries] });
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
// ---------- קיזוז ----------
// אדם שאני חייב לו וגם הוא חייב לי (רישומים פתוחים משני הצדדים): אפשר לסגור את החובות ההדדיים עד הסכום הקטן,
// ויישאר רק ההפרש. הקיזוז נעשה מהרישום הישן לחדש. רישום שמכוסה כולו מסומן כשולם, ורישום שמכוסה חלקית
// מתפצל: חלק שולם (נשמר בהיסטוריה) והיתרה נשארת פתוחה.
const openOf = (nb, personId, dir) => nb.entries.filter((e) => !e.paid && e.personId === personId && e.dir === dir);
const total = (list) => list.reduce((s, e) => s + e.amount, 0);

// כל מי שאפשר לקזז מולו: [{ person, iowe, owed, overlap }] (סכומים באגורות), מהסכום הגדול לקטן.
export function offsetCandidates(nb = data) {
  return nb.people
    .map((person) => {
      const iowe = total(openOf(nb, person.id, 'iowe'));
      const owed = total(openOf(nb, person.id, 'owed'));
      return { person, iowe, owed, overlap: Math.min(iowe, owed) };
    })
    .filter((c) => c.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
}

// מקזז מול אדם אחד. מחזיר את הסכום שקוזז (0 אם אין מה לקזז).
export function offsetPerson(personId) {
  const mine = openOf(data, personId, 'iowe');
  const theirs = openOf(data, personId, 'owed');
  const overlap = Math.min(total(mine), total(theirs));
  if (overlap <= 0) return 0;
  const covered = new Map(); // id -> כמה מהרישום קוזז
  for (const list of [mine, theirs]) {
    let left = overlap;
    for (const e of [...list].reverse()) { // הרשימה מהחדש לישן, מקזזים מהישן
      if (left <= 0) break;
      const take = Math.min(left, e.amount);
      covered.set(e.id, take);
      left -= take;
    }
  }
  const entries = data.entries.flatMap((e) => {
    const take = covered.get(e.id);
    if (!take) return [e];
    if (take === e.amount) return [{ ...e, paid: true }];
    return [{ ...e, amount: e.amount - take }, { ...e, id: newId(), amount: take, paid: true }];
  });
  commit({ ...data, entries });
  return overlap;
}

export const setPaid = (id, paid) =>
  commit({ ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, paid } : e)) });
// מחזיר את הרישום שנמחק ואת מקומו ברשימה (לביטול מחיקה), או null אם אין רישום כזה.
export function removeEntry(id) {
  const index = data.entries.findIndex((e) => e.id === id);
  if (index < 0) return null;
  const entry = data.entries[index];
  removeEntries([id]);
  return { entry, index };
}
// ביטול מחיקה: מחזיר את הרישום בדיוק כמו שהיה (אותו מזהה, תאריך ושדות) למקום שבו היה ברשימה. index הוא המקום שלו לפני המחיקה.
// אם הרישום כבר קיים לא עושים כלום, ואם האדם שלו כבר לא ברשימת השמות הידועים הוא נוסף מחדש.
export function restoreEntry(entry, index) {
  if (data.entries.some((e) => e.id === entry.id)) return;
  const people = data.people.some((p) => p.id === entry.personId) ? data.people : [...data.people, { id: entry.personId, name: entry.name }];
  const entries = [...data.entries];
  entries.splice(Math.max(0, Math.min(index, entries.length)), 0, entry);
  commit({ ...data, people, entries });
}
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
