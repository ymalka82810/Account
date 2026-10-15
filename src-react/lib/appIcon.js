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

export function iconSvg(key) {
  const v = ICONS.variants[key] || ICONS.variants.USD;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#1d2b4f"/>'
    + '<circle cx="256" cy="256" r="150" fill="#f6c945"/><circle cx="256" cy="256" r="112" fill="none" stroke="#c99a0f" stroke-width="14"/>'
    + `<path d="${v.path}" fill="#c99a0f"/></svg>`;
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
