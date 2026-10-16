// אייקון האפליקציה לפי המטבע: ₪ בישראל, $ בארה"ב, € באירופה וכו'.
// המטבע: של המשפחה (נקבע לפי המיקום שלה) אחרי כניסה; אחרת לפי המיקום של המכשיר (אזור הזמן, ואז השפה),
// ואם המיקום לא ידוע - דולר.
// באתר מתחלף ה-favicon. באפליקציה (APK) מתחלף האייקון במסך הבית דרך הפלאגין AppIcon,
// ברגע שהאפליקציה יוצאת לרקע (ראו android-plugin/AppIconPlugin.java).
import ICONS from '../../assets/currency-icons.json';
import { deviceCountry, inList, localeFor } from './currencies.js';
import { isNativeApp } from './updater.js';

const KEYS = Object.keys(ICONS.variants);
// מטבע לא מוכר: דולר
export const iconKeyFor = (currency) => ICONS.byCurrency[currency] || 'USD';

// המטבע לפי המיקום של המכשיר, או null אם המדינה לא ידועה או לא ברשימה
export function deviceCurrency() {
  const cc = deviceCountry();
  return cc && inList(cc) ? localeFor(cc).currency : null;
}

// ערימת מטבעות זהב על רקע כחול. אותה גאומטריה בדיוק ב-android-plugin/apply-currency-icons.py
// (האייקון של ה-APK) וב-scripts/gen-icon-svgs.py (קובצי ה-SVG הסטטיים) - שינוי כאן מחייב שינוי שם.
export function iconSvg(key) {
  const v = ICONS.variants[key] || ICONS.variants.USD;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    + '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#2a3e73"/><stop offset="1" stop-color="#15203d"/></linearGradient>'
    + '<linearGradient id="gold" x1="0.15" y1="0.08" x2="0.8" y2="0.95">'
    + '<stop offset="0" stop-color="#ffe694"/><stop offset="0.55" stop-color="#f6c945"/>'
    + '<stop offset="1" stop-color="#d79f16"/></linearGradient></defs>'
    + '<rect width="512" height="512" rx="96" fill="url(#bg)"/>'
    + '<g transform="translate(256 256) scale(1.22) translate(-256 -256)">'
    + '<circle cx="256" cy="280" r="126" fill="#a9760d"/><circle cx="256" cy="260" r="128" fill="#c8921a"/>'
    + '<circle cx="256" cy="238" r="130" fill="url(#gold)"/>'
    + '<circle cx="256" cy="238" r="124" fill="none" stroke="#b57f0c" stroke-width="9"/>'
    + '<circle cx="256" cy="238" r="100" fill="none" stroke="#a9730a" stroke-width="9"/>'
    + '<g transform="translate(0 -18) translate(256 256) scale(0.92) translate(-256 -256)">'
    + `<path d="${v.path}" fill="#a9730a"/></g></g></svg>`;
}

let shown = null;
export function applyAppIcon(currency) {
  const key = iconKeyFor(currency);
  if (key === shown) return;
  shown = key;
  // favicon של האתר (גם לשונית הדפדפן)
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(iconSvg(key));
  if (isNativeApp) {
    // גרסה ישנה בלי הפלאגין פשוט נשארת עם האייקון שלה
    window.Capacitor.nativePromise('AppIcon', 'setIcon', { name: key, all: KEYS }).catch(() => {});
  }
}
