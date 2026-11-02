import { UI_ICON_NAMES, uiIconUrl } from './uiIcons.js';
// טעינה מוקדמת של כל תמונות המטילים והמטבע (וגם פענוח שלהן), כדי שהמסך הראשון לא יוצג לפני שהתמונות מוכנות:
// בלי זה המספר מופיע "באוויר" והמטיל מאחוריו נטען רק אחר כך.
const IMAGES = [
  'bars/parent-get.webp', 'bars/parent-owe.webp',
  'bars/teen-blue-get.webp', 'bars/teen-blue-owe.webp', 'bars/teen-green-get.webp',
  'bars/teen-green-owe.webp', 'bars/teen-orange-get.webp', 'bars/teen-orange-owe.webp',
  'bars/child-get.webp', 'bars/child-owe.webp',
  'coin.webp',
  ...UI_ICON_NAMES.map(uiIconUrl),
];
// אם אין חיבור או שתמונה תקועה, לא חוסמים את האפליקציה יותר מזה.
const TIMEOUT_MS = 5000;

// שומרים הפניה לתמונות כדי שלא ייזרקו מהזיכרון, וכך גם ההצגה המאוחרת בעיצוב נשארת מיידית.
/** @type {HTMLImageElement[]} */
const kept = [];

/** @param {string} src */
function load(src) {
  return new Promise((resolve) => {
    const img = new Image();
    kept.push(img);
    img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(resolve); };
    img.onerror = () => resolve(undefined);
    img.src = new URL(src, document.baseURI).href;
  });
}

export function preloadImages() {
  const all = Promise.all(IMAGES.map(load));
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  return Promise.race([all, timeout]);
}
