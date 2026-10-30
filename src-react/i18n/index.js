// ---------- שפות ממשק ----------
// המפתח של כל מחרוזת הוא הנוסח העברי עצמו: t('אישור'). עברית היא שפת המקור ואין לה קובץ מילון;
// לשאר השפות יש מילון JSON ב-locales/<קוד>.json שממפה נוסח עברי לתרגום. מפתח שחסר במילון
// נופל בחזרה לעברית, כך שמחרוזת חדשה לא שוברת שום שפה.
// פרמטרים: t('שלום {name}', { name }) . ריבוי: tn(n, 'חוב אחד', '{n} חובות') לפי כללי השפה.

export const LANG_KEY = 'kupa-lang';
export const SOURCE_LANG = 'he';

// code: קוד BCP-47 | name: שם השפה בשפתה | dir: כיוון | intl: אזור לפורמט תאריכים ומספרים
export const LANGUAGES = {
  he: { name: 'עברית', dir: 'rtl', intl: 'he-IL' },
  en: { name: 'English', dir: 'ltr', intl: 'en-US' },
  fr: { name: 'Français', dir: 'ltr', intl: 'fr-FR' },
  nl: { name: 'Nederlands', dir: 'ltr', intl: 'nl-NL' },
  de: { name: 'Deutsch', dir: 'ltr', intl: 'de-DE' },
  it: { name: 'Italiano', dir: 'ltr', intl: 'it-IT' },
  es: { name: 'Español', dir: 'ltr', intl: 'es-ES' },
  pt: { name: 'Português', dir: 'ltr', intl: 'pt-PT' },
  el: { name: 'Ελληνικά', dir: 'ltr', intl: 'el-GR' },
  ru: { name: 'Русский', dir: 'ltr', intl: 'ru-RU' },
  uk: { name: 'Українська', dir: 'ltr', intl: 'uk-UA' },
  sv: { name: 'Svenska', dir: 'ltr', intl: 'sv-SE' },
  nb: { name: 'Norsk', dir: 'ltr', intl: 'nb-NO' },
  da: { name: 'Dansk', dir: 'ltr', intl: 'da-DK' },
  pl: { name: 'Polski', dir: 'ltr', intl: 'pl-PL' },
  hu: { name: 'Magyar', dir: 'ltr', intl: 'hu-HU' },
  cs: { name: 'Čeština', dir: 'ltr', intl: 'cs-CZ' },
  tr: { name: 'Türkçe', dir: 'ltr', intl: 'tr-TR' },
  ar: { name: 'العربية', dir: 'rtl', intl: 'ar-AE' },
  hi: { name: 'हिन्दी', dir: 'ltr', intl: 'hi-IN' },
  zh: { name: '中文', dir: 'ltr', intl: 'zh-CN' },
  ja: { name: '日本語', dir: 'ltr', intl: 'ja-JP' },
  th: { name: 'ไทย', dir: 'ltr', intl: 'th-TH' },
};
export const LANG_CODES = Object.keys(LANGUAGES);

// שפת ברירת המחדל של כל מדינה ברשימת המדינות (src-react/lib/currencies.js).
export const COUNTRY_LANG = {
  IL: 'he', US: 'en', CA: 'en', GB: 'en', FR: 'fr', BE: 'nl', DE: 'de', NL: 'nl', IT: 'it', ES: 'es',
  PT: 'pt', AT: 'de', IE: 'en', GR: 'el', CH: 'de', AU: 'en', NZ: 'en', ZA: 'en', AR: 'es', BR: 'pt',
  MX: 'es', RU: 'ru', UA: 'uk', SE: 'sv', NO: 'nb', DK: 'da', PL: 'pl', HU: 'hu', CZ: 'cs', TR: 'tr',
  AE: 'ar', IN: 'hi', CN: 'zh', JP: 'ja', TH: 'th', SG: 'en', HK: 'zh',
};

// vite מפצל כל קובץ שפה לחלק נפרד שנטען רק כשהשפה נבחרת.
// נכתב במלואו (import.meta.glob) כי vite מחליף אותו רק בצורה הזו, גם בבדיקות.
// @ts-ignore - הטיפוס של vite/client לא נטען בבדיקת הטיפוסים
// אנגלית היא ברירת המחדל והיא חלק מהאפליקציה. שאר השפות (גם עברית) הן חבילות נפרדות
// שהמשתמש מוריד בעצמו מבורר השפה; החבילה נשמרת במכשיר ועובדת גם בלי חיבור.
export const DEFAULT_LANG = 'en';
const PACK_PREFIX = 'kupa-lang-pack-';
// vite מפצל כל קובץ שפה לחלק נפרד שנטען רק כשמורידים אותו.
// @ts-ignore - ייחודי ל-vite
const loaders = import.meta.glob('./locales/*.json', { import: 'default', eager: false });
import en from './locales/en.json';

let lang = DEFAULT_LANG;
let dict = en;
let rules = new Intl.PluralRules(LANGUAGES[DEFAULT_LANG].intl);
const listeners = new Set();

export const currentLang = () => lang;
export const langDir = () => LANGUAGES[lang].dir;
export const intlLocale = () => LANGUAGES[lang].intl;
export const subscribeLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const readPack = (code) => { try { return JSON.parse(read(PACK_PREFIX + code) || 'null'); } catch (e) { return null; } };

// עברית היא שפת המקור (בלי מילון), אנגלית מובנית; כל השאר צריכות חבילה שהורדה.
export const isInstalled = (code) => code === DEFAULT_LANG || code === SOURCE_LANG || !!readPack(code);

const LANG_ALIASES = { iw: 'he', no: 'nb', nn: 'nb' };

// שפת המכשיר הראשונה ברשימת ההעדפות שיש לנו עבורה, או null.
export function deviceLang() {
  const prefs = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (const p of prefs) {
    const base = String(p || '').toLowerCase().split('-')[0];
    const code = LANG_ALIASES[base] || base;
    if (LANGUAGES[code]) return code;
  }
  return null;
}

// השפה ששמר המשתמש (גם אם החבילה עוד לא הורדה: setLang יוריד אותה), אחרת שפת המכשיר, אחרת אנגלית.
export function initialLang() {
  const saved = read(LANG_KEY);
  if (saved && LANGUAGES[saved]) return saved;
  return deviceLang() || DEFAULT_LANG;
}

// מחזיר את המילון: מובנה, שמור במכשיר, או מוריד עכשיו (ושומר). זורק אם ההורדה נכשלה.
async function loadDict(code) {
  if (code === SOURCE_LANG) return {};
  if (code === DEFAULT_LANG) return en;
  const cached = readPack(code);
  if (cached) return cached;
  const load = loaders[`./locales/${code}.json`];
  if (!load) throw new Error('no pack');
  const d = await load();
  try { localStorage.setItem(PACK_PREFIX + code, JSON.stringify(d)); } catch (e) { /* אין מקום: עובד עד סגירת האפליקציה */ }
  return d;
}

// מסיר חבילת שפה שהורדה (לא את האנגלית ולא את השפה הפעילה).
export function removeLang(code) {
  if (code === lang || code === DEFAULT_LANG || code === SOURCE_LANG) return;
  try { localStorage.removeItem(PACK_PREFIX + code); } catch (e) { /* */ }
  listeners.forEach((fn) => fn(lang));
}

function applyDocument() {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = LANGUAGES[lang].dir;
}

// מחליף שפה (מוריד אותה אם צריך). מחזיר false אם ההורדה נכשלה והשפה לא הוחלפה.
export async function setLang(code, { persist = true } = {}) {
  if (!LANGUAGES[code]) code = DEFAULT_LANG;
  let next;
  try { next = await loadDict(code); } catch (e) { return false; }
  dict = next;
  lang = code;
  rules = new Intl.PluralRules(LANGUAGES[code].intl);
  if (persist) { try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* */ } }
  applyDocument();
  listeners.forEach((fn) => fn(code));
  return true;
}

const fill = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s);

export function t(key, params) {
  const hit = dict[key];
  return fill(typeof hit === 'string' && hit ? hit : key, params);
}

// ריבוי לפי כללי השפה הנוכחית. התרגום של צורה יכול להיות מחרוזת אחת (שפות בלי ריבוי)
// או אובייקט {one, two, few, many, other}. במקור העברי: tn(n, 'חוב אחד', '{n} חובות').
export function tn(n, one, many, params) {
  const key = `${one}|${many}`;
  const hit = dict[key];
  let s;
  if (hit && typeof hit === 'object') s = hit[rules.select(n)] || hit.other || many;
  else if (typeof hit === 'string' && hit) s = hit;
  else s = n === 1 ? one : many;
  return fill(s, { n, ...params });
}

// שפה מוצעת לפי מדינה (לבחירת מדינה בהגדרות המשפחה).
export const langForCountry = (country) => COUNTRY_LANG[country] || null;
