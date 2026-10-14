// ---------- מצב גלובלי משותף ----------
// אובייקט יחיד שכל המודולים מייבאים ומשנים ישירות (state.token = ...),
// כדי להימנע מבעיות binding של ייצוא/ייבוא משתנים הדדיים ב-ES modules.

export const TOKEN_KEY = 'kupa-token';
export const LEGACY_KEY = 'family-account-v1';
export const LEGACY_DONE_KEY = 'kupa-legacy-imported';
export const CODE_KEY = 'kupa-code';
export const DEVICE_KEY = 'kupa-device';
export const LAST_PERSON_KEY = 'kupa-last-person';
export const UNDO_MS = 10 * 60 * 1000;
export const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🐨', '🐶', '🐱', '🚀', '😎', '🎧', '🛹', '⚡', '🔥', '🎮'];
export const FRIEND_MAX = 50000; // באגורות, כמו בשרת
export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const THEME_COLOR = { parent: '#1f2933', child: '#1d2b4f', teen: '#2a1b6e' };
export const TAB_LABELS = {
  parent: { family: 'סקירה משפחתית', home: 'הכסף שלי', history: 'היסטוריה' },
  child: { home: '🏠 הכסף שלי', history: '📜 מה היה' },
  teen: { home: '💰 הכסף שלי', friends: '🤝 חברים', history: '📜 היסטוריה' },
};

export const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  legacyPeople: null, // null = עוד לא נטען. הורים מהגרסה הישנה (בלי קוד משפחה)
  codeChecked: false, // האם בדקנו קוד שמור במכשיר
  fam: null,         // {code, name, codeRole, people} אחרי שהוזן קוד משפחה תקין
  view: 'welcome',   // welcome | setup | join
  pinFlow: null,     // {person, legacy, mode:'login'|'new', first, entered, busy, error, shakes}
  pushSyncedFor: '',
};

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
