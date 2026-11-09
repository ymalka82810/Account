import { isNativeApp } from './updater.js';

// קישורי Android App Links: קישור לאתר (ymalka82810.github.io/Account/#manage) נפתח באפליקציה במקום בדפדפן.
// האפליקציה טוענת את האתר מהמכשיר, אז כאן לוקחים מהקישור רק את הלשונית (#manage) וקובעים אותה בכתובת הפנימית.
// נשלח למשל מבקשת הצטרפות בוואטסאפ, כדי שההורה ינחת ישר איפה שמאשרים.
const TABS = ['home', 'friends', 'history', 'family', 'manage'];

function apply(/** @type {string | undefined} */ url) {
  try {
    const h = new URL(String(url)).hash.slice(1);
    if (TABS.includes(h) && location.hash !== '#' + h) location.hash = '#' + h;
  } catch (e) { /* קישור לא תקין: מתעלמים */ }
}

export async function initDeepLinks() {
  if (!isNativeApp) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', (/** @type {{ url: string }} */ e) => apply(e.url));
    const launch = await App.getLaunchUrl();
    if (launch) apply(launch.url);
  } catch (e) { /* בלי הפלאגין (גרסה ישנה) אין קישורים עמוקים, והאפליקציה עובדת כרגיל */ }
}
