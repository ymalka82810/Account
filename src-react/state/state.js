// ---------- מצב גלובלי משותף ----------
// אובייקט יחיד שכל המודולים מייבאים ומשנים ישירות (state.token = ...),
// כדי להימנע מבעיות binding של ייצוא/ייבוא משתנים הדדיים ב-ES modules.

import { t, intlLocale } from '../i18n/index.js';

export const TOKEN_KEY = 'kupa-token';
export const LEGACY_KEY = 'family-account-v1';
export const LEGACY_DONE_KEY = 'kupa-legacy-imported';
export const CODE_KEY = 'kupa-code';
export const DEVICE_KEY = 'kupa-device';
export const LAST_PERSON_KEY = 'kupa-last-person';
// התפקיד (וצבעי הנוער) של מי שנכנס לאחרונה מהמכשיר הזה - כדי שמסך הטעינה
// של הכניסה והיציאה ייראה כמו שאר המסכים של אותו תפקיד.
export const LAST_ROLE_KEY = 'kupa-last-role';
export const LAST_PALETTE_KEY = 'kupa-last-palette';
// דמויות לילדים/ות ונערים/ות - אותה רשימה לכולם (לא מחולקת לפי מגדר).
export const AVATARS = [
  '🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🐨', '🐶', '🐱', '🚀', '😎', '🎧', '🛹', '⚡', '🔥', '🎮',
  // חיות
  '🐮', '🐷', '🐰', '🐹', '🐭', '🦝', '🦓', '🦒', '🐘', '🦏', '🦛', '🐴', '🐔', '🐧', '🐦', '🦉', '🦅', '🦇',
  '🐺', '🐗', '🐻', '🐻‍❄️', '🦥', '🦦', '🦨', '🦘', '🐊', '🐢', '🐍', '🦎', '🦑', '🦀', '🐡', '🐠', '🐟', '🐬',
  '🐳', '🐋', '🦈', '🐌', '🦋', '🐛', '🐝', '🐞', '🕷️', '🦂', '🦗', '🐜', '🐫', '🐪', '🦙', '🐐', '🐑', '🐄',
  '🦃', '🦚', '🦜', '🦢', '🦩', '🦡', '🐿️', '🦔',
  // דמיוני ופנטזיה
  '🐲', '🐉', '👽', '👾', '🤖', '👻', '💀', '🎃', '👹', '👺', '🧚', '🧜‍♀️', '🧜‍♂️', '🧞', '🧛', '🧟',
  '🦸', '🦸‍♀️', '🦸‍♂️', '🦹', '🦹‍♀️', '🦹‍♂️', '🧙', '🧙‍♀️', '🧙‍♂️', '🥷', '🤡', '🎅', '🤶',
  // ספורט ותחביבים
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🥋', '⛳', '🏹', '🎣', '🤿', '🎿', '🛷', '🥌',
  '🎯', '🕹️', '🎲', '🧩', '♟️', '🎨', '🎭', '🎪', '🎬', '🎤', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻',
  // כלי תחבורה
  '🛸', '🚲', '🏍️', '🚗', '🚕', '🚙', '🚓', '🚑', '🚒', '🚜', '🛵', '⛵', '🚤', '🛶', '🚁', '✈️', '🚂',
  // טבע ומזג אוויר
  '🌈', '⭐', '🌟', '✨', '❄️', '🌙', '☀️', '🌊', '🌵', '🌴', '🌲', '🌸', '🌺', '🌻', '🌼', '🌷', '🍀', '🍁', '🌹',
  // אוכל
  '🍕', '🍔', '🍟', '🌮', '🍩', '🍪', '🍫', '🍭', '🍉', '🍓', '🍒', '🍍', '🥑', '🧁', '🍰', '🎂',
];
export const PARENT_AVATARS = [
  '👨', '👩', '👱‍♂️', '👱‍♀️', '👨‍🦰', '👩‍🦰',
  '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '🧔', '👴', '👵',
  // גוונים (מבוססים על איש/אישה)
  '👨🏻', '👩🏻', '👨🏼', '👩🏼', '👨🏽', '👩🏽', '👨🏾', '👩🏾', '👨🏿', '👩🏿',
];
export const FRIEND_MAX = 50000; // באגורות, כמו בשרת
// 0 = ראשון. שמות הימים באים מ-Intl בשפת הממשק (2023-01-01 היה יום ראשון).
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const weekdayName = (i) => new Date(Date.UTC(2023, 0, 1 + Number(i))).toLocaleDateString(intlLocale(), { weekday: 'long', timeZone: 'UTC' });
export const THEME_COLOR = { parent: '#000000', child: '#fbf3f7', teen: '#000000' };
// פונקציה ולא קבוע: התרגום נקרא בזמן הרינדור, בשפה הנוכחית.
export const tabLabels = () => ({
  parent: { family: t('משפחה'), home: t('הכסף שלי'), history: t('היסטוריה'), manage: t('ניהול') },
  child: { home: t('💰 הכסף שלי'), history: t('📜 מה היה') },
  teen: { home: t('💰 הכסף שלי'), friends: t('🤝 חברים'), history: t('📜 היסטוריה') },
});

// המסך הפעיל (פנקס, הקמה, הצטרפות) נשמר ב-sessionStorage, כדי שרענון הדף ישאיר אותך באותו מסך
// ולא יחזיר למסך הפתיחה או הכניסה. נמחק עם סגירת הלשונית.
const VIEW_KEY = 'kupa-view';
const NB_BACK_KEY = 'kupa-nb-back';
const PERSIST_VIEWS = ['setup', 'join', 'notebook'];
function savedView() {
  try { const v = sessionStorage.getItem(VIEW_KEY); return v && PERSIST_VIEWS.includes(v) ? v : ''; } catch (e) { return ''; }
}
function saveSession(key, value) {
  try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch (e) { /* */ }
}

export const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  legacyPeople: null, // null = עוד לא נטען. הורים מהגרסה הישנה (בלי קוד משפחה)
  codeChecked: false, // האם בדקנו קוד שמור במכשיר
  fam: null,         // {code, name, people} אחרי שהוזן קוד משפחה תקין
  // מכשיר בלי כניסה שמורה ובלי משפחה שמורה נפתח ישר בפנקס האישי.
  view: savedView() || ((localStorage.getItem(TOKEN_KEY) || localStorage.getItem(CODE_KEY)) ? 'welcome' : 'notebook'), // welcome | setup | join | notebook
  pinFlow: null,     // {person, legacy, mode:'login'|'new', first, entered, busy, error, shakes}
  pushSyncedFor: '',
  offlineNotebook: false, // הפנקס נפתח ממסך "אין חיבור" למי שיש לו כניסה שמורה (App.jsx: currentScreen)
  notebookBack: (() => { try { return sessionStorage.getItem(NB_BACK_KEY) === '1'; } catch (e) { return false; } })(), // יש כפתור חזרה מהפנקס
};

// כל שינוי של view או notebookBack (בכל מקום בקוד) נשמר לרענון הבא.
for (const [prop, key, enc] of /** @type {const} */ ([['view', VIEW_KEY, (/** @type {string} */ v) => (PERSIST_VIEWS.includes(v) ? v : '')], ['notebookBack', NB_BACK_KEY, (/** @type {boolean} */ v) => (v ? '1' : '')]])) {
  let cur = /** @type {any} */ (state)[prop];
  Object.defineProperty(state, prop, {
    enumerable: true,
    get: () => cur,
    set: (/** @type {any} */ v) => { cur = v; saveSession(key, /** @type {any} */ (enc)(v)); },
  });
}

// ---------- הודעה לקומפוננטות על שינוי ב-state ----------
// מסכי הכניסה ב-React נרשמים כאן. bumpAuth() נקרא בכל שינוי (route, setToken, ...).
let version = 0;
const listeners = new Set();
export const subscribeAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const authVersion = () => version;
export function bumpAuth() {
  version += 1;
  listeners.forEach((fn) => fn());
}
