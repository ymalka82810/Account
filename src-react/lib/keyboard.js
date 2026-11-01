// לוגיקה טהורה של המקלדת של האפליקציה (src-react/components/shared/AppKeyboard.jsx):
// איזה סוג מקלדת כל שדה צריך, פריסות האותיות, והחלת מקש על ערך השדה.
// בלי תלות ב-React, כדי שאפשר יהיה לבדוק (tests/keyboard.test.ts).

// ---------- פריסות אותיות ----------
// כל שורה משמאל לימין כפי שהיא מצוירת על המסך. לעברית ולערבית אין אותיות גדולות.
export const LAYOUTS = {
  en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  he: ['קראטוןםפ', 'שדגכעיחלךף', 'זסבהנמצתץ'],
  ru: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'],
  uk: ['йцукенгшщзхї', 'фівапролджє', 'ячсмитьбюґ'],
  ar: ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرىةوزظذ'],
  el: ['ςερτυθιοπ', 'ασδφγηξκλ', 'ζχψωβνμ'],
  // לטיניות: האותיות הנפוצות של השפה על המקשים, השאר בדף הסימנים (ACCENTS)
  fr: ['azertyuiop', 'qsdfghjklm', 'wxcvbnéèç'],
  de: ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnmß'],
  nl: ['qwertyuiop', 'asdfghjkl', 'zxcvbnmé'],
  it: ['qwertyuiopè', 'asdfghjklòà', 'zxcvbnmùì'],
  es: ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'],
  pt: ['qwertyuiop', 'asdfghjklç', 'zxcvbnmãõ'],
  sv: ['qwertyuiopå', 'asdfghjklöä', 'zxcvbnm'],
  nb: ['qwertyuiopå', 'asdfghjkløæ', 'zxcvbnm'],
  da: ['qwertyuiopå', 'asdfghjklæø', 'zxcvbnm'],
  pl: ['qwertyuiopó', 'asdfghjklł', 'zxcvbnmąę'],
  hu: ['qwertzuiopú', 'asdfghjkléá', 'yxcvbnmöü'],
  cs: ['qwertzuiopú', 'asdfghjklůé', 'yxcvbnmíá'],
  tr: ['qwertyuıopğ', 'asdfghjklşi', 'zxcvbnmöç'],
  // הינדי: InScript, הפריסה הסטנדרטית באנדרואיד ובווינדוס (שכבת shift נותנת את האותיות הנשפות והתנועות הארוכות)
  hi: ['ौैाीूबहगदजड', 'ोे्िुपरकतचट', 'ंमनवलसषय'],
  // תאילנדית: Kedmanee
  th: ['ๆไำพะัีรนยบล', 'ฟหกดเ้่าสวง', 'ผปแอิืทมใฝ'],
  // יפנית: טבלת הקאנה (חמשת הקולות), בלי המרה לקאנג'י. ゛ ו-゜ משלימים את הצליל המוטעם, shift נותן קאנה קטנה
  ja: ['あいうえおかきくけこ', 'さしすせそたちつてと', 'なにぬねのはひふへほ', 'まみむめもやゆよわん', 'らりるれろをー\u3099\u309A'],
};

// שכבת shift לפריסות שאינן עם אותיות גדולות וקטנות
export const SHIFT_MAP = {
  hi: {
    'ौ': 'औ', 'ै': 'ऐ', 'ा': 'आ', 'ी': 'ई', 'ू': 'ऊ', 'ब': 'भ', 'ह': 'ङ', 'ग': 'घ', 'द': 'ध', 'ज': 'झ', 'ड': 'ढ',
    'ो': 'ओ', 'े': 'ए', '्': 'अ', 'ि': 'इ', 'ु': 'उ', 'प': 'फ', 'र': 'ऱ', 'क': 'ख', 'त': 'थ', 'च': 'छ', 'ट': 'ठ',
    'ं': 'ँ', 'म': 'ण', 'न': 'ऩ', 'व': 'ऴ', 'ल': 'ळ', 'स': 'श', 'ष': 'क्ष', 'य': 'ज्ञ',
  },
  th: {
    'ๆ': '๐', 'ไ': '"', 'ำ': 'ฎ', 'พ': 'ฑ', 'ะ': 'ธ', 'ั': 'ํ', 'ี': '๊', 'ร': 'ณ', 'น': 'ฯ', 'ย': 'ญ', 'บ': 'ฐ', 'ล': ',',
    'ฟ': 'ฤ', 'ห': 'ฆ', 'ก': 'ฏ', 'ด': 'โ', 'เ': 'ฌ', '้': '็', '่': '๋', 'า': 'ษ', 'ส': 'ศ', 'ว': 'ซ', 'ง': '.',
    'ผ': '(', 'ป': ')', 'แ': 'ฉ', 'อ': 'ฮ', 'ิ': 'ฺ', 'ื': '์', 'ท': '?', 'ม': 'ฒ', 'ใ': 'ฬ', 'ฝ': 'ฦ',
  },
  ja: { 'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ', 'つ': 'っ', 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ' },
};
// פריסות עם אותיות גדולות וקטנות (אות גדולה אוטומטית בתחילת משפט רק בהן)
const CASED = new Set(['en', 'fr', 'de', 'nl', 'it', 'es', 'pt', 'sv', 'nb', 'da', 'pl', 'hu', 'cs', 'tr', 'ru', 'uk', 'el']);
// הצגת תווים משלימים (ניקוד יפני) על המקש
export const KEY_LABEL = { '\u3099': '゛', '\u309A': '゜' };

/** התו אחרי shift: אות גדולה, או התו מהשכבה השנייה של הפריסה. */
export function shiftChar(/** @type {string} */ layout, /** @type {string} */ c) {
  const m = /** @type {Record<string, Record<string, string>>} */ (SHIFT_MAP)[layout];
  if (m) return m[c] ?? c;
  return CASED.has(layout) ? c.toLocaleUpperCase(layout === 'tr' ? 'tr' : undefined) : c;
}
export const autoShiftLayout = (/** @type {string} */ layout) => CASED.has(layout);

// תווית הכפתור שמחזיר לדף האותיות מדף הסימנים
export const LAYOUT_LABEL = { he: 'אבג', ru: 'абв', uk: 'абв', ar: 'أبج', el: 'αβγ', hi: 'अआइ', th: 'กขค', ja: 'あいう' };

// לאילו שפות ממשק יש פריסה משלהן: כל השפות חוץ מאנגלית (שהיא הפריסה השנייה בסבב) וסינית, שכתיבתה דורשת מערכת קלט
// עם המרה לאותיות סיניות. סינית נכתבת על הפריסה הלטינית, ובמקש הגלובוס אפשר לעבור למקלדת של המערכת.
const NATIVE = Object.fromEntries(Object.keys(LAYOUTS).filter((l) => l !== 'en').map((l) => [l, l]));

// אותיות עם סימנים לכל שפה לטינית, בדף הסימנים
export const ACCENTS = {
  fr: 'éèêëàâçîïôœùûü',
  de: 'äöüß',
  es: 'áéíóúñü¿¡',
  pt: 'ãõáâàçéêíóôú',
  it: 'àèéìòù',
  nl: 'ëïéèóú',
  pl: 'ąćęłńóśźż',
  cs: 'áčďéěíňóřšťúůýž',
  hu: 'áéíóöőúüű',
  tr: 'çğıöşüİ',
  sv: 'åäö',
  nb: 'åæø',
  da: 'åæø',
};

/** סדר המקלדות שמקש הגלובוס עובר עליהן: פריסת השפה ואנגלית, חוזר חלילה (עברית ← אנגלית ← עברית).
 * רק לשפות בלי פריסה משלנו (סינית, ואנגלית כשהיא שפת הממשק) יש בסוף גם מקלדת המערכת ('sys'). */
export function layoutOrder(/** @type {string} */ lang, /** @type {string} */ kind) {
  if (kind === 'latin' || kind === 'email') return ['en'];
  const native = NATIVE[/** @type {keyof typeof NATIVE} */ (lang)];
  return native ? [native, 'en'] : ['en', 'sys'];
}

/** האם יש בפריסה מקש shift (אותיות גדולות, או שכבה שנייה). */
export const hasCase = (/** @type {string} */ layout) => CASED.has(layout) || layout in SHIFT_MAP;

// ---------- סוג השדה ----------
const NON_TEXT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week', 'hidden']);

/** האם המקלדת שלנו צריכה לשרת את האלמנט הזה. data-native-kb מוציא שדה מהכלל. */
export function isKbTarget(/** @type {any} */ el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.disabled || el.readOnly || el.dataset?.nativeKb != null) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !NON_TEXT_TYPES.has((el.getAttribute('type') || 'text').toLowerCase());
}

/**
 * num: ספרות בלבד | dec: ספרות ונקודה אחת | email | latin: קוד באותיות לועזיות וספרות | text: טקסט חופשי.
 * אם המקלדת כבר הסתירה את ה-inputmode המקורי (inputmode="none"), הוא נשמר ב-data-kb-im.
 */
export function kindOf(/** @type {any} */ el) {
  const forced = el.dataset?.kb;
  if (forced === 'num' || forced === 'dec' || forced === 'email' || forced === 'latin' || forced === 'text') return forced;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  const im = (el.dataset?.kbIm ?? el.getAttribute('inputmode') ?? '').toLowerCase();
  if (type === 'number') return 'dec';
  if (type === 'tel' || im === 'numeric') return 'num';
  if (im === 'decimal') return 'dec';
  if (type === 'email' || im === 'email') return 'email';
  const cap = (el.getAttribute('autocapitalize') || '').toLowerCase();
  if (cap === 'characters' || el.getAttribute('dir') === 'ltr') return 'latin';
  return 'text';
}

// ---------- החלת מקש על ערך ----------
/**
 * state: { value, start, end, max } (max = אורך מרבי, Infinity אם אין). key: 'del' או תו להוספה.
 * מחזיר { value, caret } או null אם המקש לא מתקבל (ספרה בלבד, נקודה שנייה, חריגה מהאורך).
 */
export function applyKey(/** @type {{ value: string, start: number, end: number, max: number }} */ s, /** @type {string} */ key, /** @type {string} */ kind) {
  const { value } = s;
  const start = Math.min(s.start, s.end), end = Math.max(s.start, s.end);
  if (key === 'del') {
    if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
    if (start === 0) return null;
    // תו שמורכב משני חלקי UTF-16 (אימוג'י) נמחק בשלמותו
    const cut = /[\uDC00-\uDFFF]/.test(value[start - 1]) && start >= 2 ? 2 : 1;
    return { value: value.slice(0, start - cut) + value.slice(start), caret: start - cut };
  }
  if (kind === 'num' && !/^\d$/.test(key)) return null;
  if (kind === 'dec') {
    if (!/^[\d.]$/.test(key)) return null;
    if (key === '.' && (value.slice(0, start) + value.slice(end)).includes('.')) return null;
  }
  if ((kind === 'email' || kind === 'latin') && /\s/.test(key)) return null;
  if (value.length - (end - start) + key.length > s.max) return null;
  // ניקוד יפני (゛ ゜) מתחבר לתו שלפניו: か + ゛ = が
  if (key === '\u3099' || key === '\u309A') {
    const before = (value.slice(0, start) + key).normalize('NFC');
    return { value: before + value.slice(end), caret: before.length };
  }
  return { value: value.slice(0, start) + key + value.slice(end), caret: start + key.length };
}

/** האם האות הבאה צריכה להיות גדולה: בתחילת שדה ואחרי נקודה, סימן שאלה או קריאה. */
export function wantsAutoShift(/** @type {string} */ before) {
  return before === '' || /[.!?]\s+$/.test(before);
}

/** שורות דף הסימנים. */
export function symbolRows(/** @type {string} */ lang, /** @type {string} */ kind) {
  if (kind === 'email') return [[...'@._-+#'], [...'!%&*=/?']];
  const rows = [[...'-/:;()&@"'], [...".,?!'%+=*"]];
  const acc = ACCENTS[/** @type {keyof typeof ACCENTS} */ (lang)];
  if (acc) rows.push([...acc]);
  return rows;
}

// ---------- השלמת מילים ----------
// המקלדת של המערכת לא חושפת את ההצעות שלה לאפליקציה, אז ההשלמה כאן עצמאית: המילים שהמשתמש כתב בעצמו
// (נשמרות במכשיר בלבד) ואחריהן רשימת המילים הנפוצות של השפה (public/words/<שפה>.txt).

const WORD_TAIL = /[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u;
/** המילה (או תחילת המילה) שמסתיימת בסמן. */
export function currentWord(/** @type {string} */ before) {
  const m = WORD_TAIL.exec(before);
  return m ? m[0] : '';
}

/**
 * עד limit מילים שמתחילות ב-prefix: קודם המילים האישיות, אחריהן הנפוצות. אות ראשונה גדולה ב-prefix נשמרת בהצעה.
 * פחות משתי אותיות לא מציעים, ומילה שכבר הוקלדה במלואה לא מוצעת שוב.
 */
export function suggest(/** @type {string} */ prefix, /** @type {string[][]} */ lists, limit = 3) {
  if ([...prefix].length < 2) return [];
  const low = prefix.toLowerCase();
  const cap = prefix[0] !== prefix[0].toLowerCase();
  const out = /** @type {string[]} */ ([]);
  for (const list of lists) {
    for (const w of list) {
      if (w.length <= low.length || !w.toLowerCase().startsWith(low)) continue;
      const shown = cap ? w[0].toUpperCase() + w.slice(1) : w;
      if (!out.includes(shown)) out.push(shown);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** מחליף את תחילת המילה שלפני הסמן במילה המלאה ומוסיף רווח (אלא אם כבר יש רווח אחריה). null אם חורג מהאורך המרבי. */
export function applySuggestion(/** @type {{ value: string, start: number, end: number, max: number }} */ s, /** @type {string} */ word) {
  const start = Math.min(s.start, s.end);
  const prefix = currentWord(s.value.slice(0, start));
  const rest = s.value.slice(Math.max(s.start, s.end));
  const tail = /^\s/.test(rest) ? '' : ' ';
  const value = s.value.slice(0, start - prefix.length) + word + tail + rest;
  if (value.length > s.max) return null;
  return { value, caret: start - prefix.length + word.length + tail.length };
}

const WORDS_KEY = 'kupa-kb-words';
const MAX_PERSONAL = 300;
/** @type {Record<string, number> | null} */
let personal = null;
function loadPersonal() {
  if (personal) return personal;
  try { personal = JSON.parse(localStorage.getItem(WORDS_KEY) || '{}') || {}; } catch { personal = {}; }
  return /** @type {Record<string, number>} */ (personal);
}
/** מילה שהמשתמש סיים להקליד נזכרת להצעות הבאות (במכשיר בלבד). */
export function learnWord(/** @type {string} */ word) {
  const w = word.replace(/^['’-]+|['’-]+$/g, '');
  if ([...w].length < 2 || w.length > 20) return;
  const map = loadPersonal();
  const key = w.toLowerCase();
  map[key] = (map[key] || 0) + 1;
  const keys = Object.keys(map);
  if (keys.length > MAX_PERSONAL) {
    keys.sort((a, b) => map[a] - map[b]).slice(0, keys.length - MAX_PERSONAL).forEach((k) => { delete map[k]; });
  }
  try { localStorage.setItem(WORDS_KEY, JSON.stringify(map)); } catch { /* */ }
}
/** המילים האישיות, הנפוצות אצל המשתמש קודם. */
export function personalWords() {
  const map = loadPersonal();
  return Object.keys(map).sort((a, b) => map[b] - map[a]);
}
