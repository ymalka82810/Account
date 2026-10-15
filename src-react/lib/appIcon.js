// אייקון האפליקציה לפי המטבע: ₪ בישראל, $ בארה"ב, € באירופה וכו'.
// המטבע: של המשפחה (נקבע לפי המיקום שלה) אחרי כניסה; לפני כניסה - לפי המיקום של המכשיר (אזור הזמן, ואז השפה).
// באתר מתחלף ה-favicon. באפליקציה (APK) מתחלף האייקון במסך הבית דרך הפלאגין AppIcon,
// ברגע שהאפליקציה יוצאת לרקע (ראו android-plugin/AppIconPlugin.java).
import ICONS from '../../assets/currency-icons.json';
import { COUNTRIES } from './currencies.js';
import { isNativeApp } from './updater.js';

const KEYS = Object.keys(ICONS.variants);
// מטבע בלי סמל משלו: מטבע זהב ריק
export const iconKeyFor = (currency) => ICONS.byCurrency[currency] || 'COIN';

// אזורי זמן של המדינות ברשימה (כשהדפדפן לא מגלה מדינה מהשפה)
const TZ_COUNTRY = {
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL',
  'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Vienna': 'AT',
  'Europe/Athens': 'GR', 'Europe/Zurich': 'CH', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL',
  'Europe/Budapest': 'HU', 'Europe/Prague': 'CZ', 'Europe/Istanbul': 'TR', 'Asia/Dubai': 'AE',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK', 'Africa/Johannesburg': 'ZA', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Mexico_City': 'MX',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'Pacific/Auckland': 'NZ',
};

// המטבע לפי המיקום של המכשיר, או null אם לא ידוע
export function deviceCurrency() {
  const byCountry = (cc) => { const hit = COUNTRIES.find((c) => c[0] === cc); return hit ? hit[2] : null; };
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TZ_COUNTRY[tz]) return byCountry(TZ_COUNTRY[tz]);
    if (tz.startsWith('Australia/')) return 'AUD';
  } catch (e) { /* */ }
  for (const lang of navigator.languages || [navigator.language]) {
    const region = (lang || '').split('-')[1];
    const cur = region && byCountry(region.toUpperCase());
    if (cur) return cur;
  }
  // שאר אזורי הזמן של אמריקה (כשהשפה לא אמרה מדינה): ארה"ב
  try { if ((Intl.DateTimeFormat().resolvedOptions().timeZone || '').startsWith('America/')) return 'USD'; } catch (e) { /* */ }
  return null;
}

export function iconSvg(key) {
  const v = ICONS.variants[key] || ICONS.variants.ILS;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#1d2b4f"/>'
    + '<circle cx="256" cy="256" r="150" fill="#f6c945"/><circle cx="256" cy="256" r="112" fill="none" stroke="#c99a0f" stroke-width="14"/>'
    + (v.path ? `<path d="${v.path}" fill="#c99a0f"/>` : '') + '</svg>';
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
