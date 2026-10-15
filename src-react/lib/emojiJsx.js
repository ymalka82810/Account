// "נפח" לכל האימוג'ים באפליקציה, בלי לגעת בכל קומפוננטה בנפרד.
// זה ה-JSX runtime של הפרויקט (vite.config.js: oxc.jsx.importSource = 'emoji-jsx'):
// כל טקסט שנכנס לתוך אלמנט HTML עובר כאן, וכל אימוג'י בו נעטף ב-<span class="emo">,
// שמקבל ב-style.css את אפקט הסטיקר התלת-ממדי (אור מלמעלה, צל מתחת, צל הטלה).
// רק אלמנטים של HTML (div, button, span...) - ילדים של קומפוננטות נשארים כמו שהם עד שהם מגיעים ל-HTML,
// כך שקומפוננטה שמקבלת מחרוזת (למשל label) מקבלת מחרוזת רגילה.
import { jsx as rjsx, jsxs as rjsxs, Fragment } from 'react/jsx-runtime';

// אימוג'י: סמל ציורי + וריאציה/גוון עור, כולל צירופי ZWJ (👨‍👩‍👧) ודגלים
const PIC = '\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?';
const RE = new RegExp(`((?:${PIC})(?:\\u200D(?:${PIC}))*|[\\u{1F1E6}-\\u{1F1FF}]{2})`, 'u');
// סימנים "טקסטואליים" שנחשבים ציוריים אבל לא אמורים לקבל נפח
const PLAIN = new Set(['©', '®', '™', '‼', '⁉']);
// אלמנטים שהתוכן שלהם חייב להישאר טקסט בלבד
const SKIP = new Set(['option', 'title', 'textarea', 'style', 'script']);

function wrapText(s) {
  if (!RE.test(s)) return s;
  const parts = s.split(RE);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (i % 2 && !PLAIN.has(p)) out.push(rjsx('span', { className: 'emo', children: p }, 'e' + i));
    else out.push(p);
  }
  return out;
}

function wrapChildren(c) {
  if (typeof c === 'string') return wrapText(c);
  if (Array.isArray(c)) {
    let changed = false;
    const mapped = c.map((x) => { const y = wrapChildren(x); if (y !== x) changed = true; return y; });
    return changed ? mapped : c;
  }
  return c;
}

export function fix(type, props) {
  if (typeof type !== 'string' || SKIP.has(type) || !props || props.children == null) return props;
  const children = wrapChildren(props.children);
  return children === props.children ? props : { ...props, children };
}

export function jsx(type, props, key) { return rjsx(type, fix(type, props), key); }
// ב-jsxs הילדים הם מערך קבוע; אם עטפנו מחרוזת בתוכו היא הופכת למערך עם מפתחות, ש-React מקבל
export function jsxs(type, props, key) { return rjsxs(type, fix(type, props), key); }
export { Fragment };
