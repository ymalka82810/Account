import { t } from '../i18n/index.js';
import { state } from '../state/state.js';
import { toast, errMsg } from './helpers.js';
import { call } from './api.js';

// ---------- התראות (Push) ----------
// באפליקציית האנדרואיד (Capacitor) ההתראות עוברות דרך FCM, כי ב-WebView אין Web Push.
// הן פעילות רק אחרי שהוגדר Firebase (קובץ google-services.json באפליקציה) והופעל window.FCM_ENABLED ב-config.js:
// בלי ההגדרה, בקשת הרישום מקריסה את האפליקציה, ולכן ברירת המחדל כבויה.
const FCM_KEY = 'kupa-fcm-token';
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativeSupported = () => isNative() && window.FCM_ENABLED === true;
const webSupported = () => !!window.VAPID_PUBLIC_KEY && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window;
export const pushSupported = () => (isNative() ? nativeSupported() : webSupported());

const loadNative = async () => (await import('@capacitor/push-notifications')).PushNotifications;

// מבקש אסימון FCM מהמכשיר. נפתר עם האסימון, או נדחה אם הרישום נכשל.
async function registerNative() {
  const PN = await loadNative();
  return new Promise((resolve, reject) => {
    /** @type {any[]} */
    const handles = [];
    const done = (/** @type {() => void} */ fn) => { handles.forEach((h) => h.remove()); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), 15000);
    Promise.all([
      PN.addListener('registration', (/** @type {{ value: string }} */ tok) => { clearTimeout(timer); done(() => resolve(tok.value)); }),
      PN.addListener('registrationError', (/** @type {any} */ err) => { clearTimeout(timer); done(() => reject(err)); }),
    ]).then((hs) => { handles.push(...hs); return PN.register(); }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}
async function sendNativeToken(/** @type {string} */ deviceToken) {
  await call('push:subscribeNative', { token: state.token, deviceToken });
  try { localStorage.setItem(FCM_KEY, deviceToken); } catch (e) { /* */ }
}
const savedNativeToken = () => { try { return localStorage.getItem(FCM_KEY) || ''; } catch (e) { return ''; } };

function keyToBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const getPushSub = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

async function sendSubToServer(sub) {
  const j = sub.toJSON();
  await call('push:subscribe', { token: state.token, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}

// האם ההתראות פעילות במכשיר הזה.
export async function isPushOn() {
  if (isNative()) {
    try { return !!savedNativeToken() && (await (await loadNative()).checkPermissions()).receive === 'granted'; } catch (e) { return false; }
  }
  try { return Notification.permission === 'granted' && !!(await getPushSub()); } catch (e) { return false; }
}

export async function enablePush() {
  if (isNative()) {
    try {
      const PN = await loadNative();
      const perm = await PN.requestPermissions();
      if (perm.receive !== 'granted') { toast(t('ההתראות חסומות. אפשר לאשר אותן בהגדרות הדפדפן.')); return; }
      await sendNativeToken(/** @type {string} */ (await registerNative()));
      toast(t('ההתראות הופעלו 🔔'));
    } catch (e) { toast(e && /** @type {any} */ (e).data ? errMsg(e) : t('לא הצלחנו להפעיל התראות במכשיר הזה')); }
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(t('ההתראות חסומות. אפשר לאשר אותן בהגדרות הדפדפן.')); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(window.VAPID_PUBLIC_KEY) });
    await sendSubToServer(sub);
    toast(t('ההתראות הופעלו 🔔'));
  } catch (e) { toast(e && e.data ? errMsg(e) : t('לא הצלחנו להפעיל התראות במכשיר הזה')); }
}

export async function disablePush() {
  if (isNative()) {
    try {
      const tok = savedNativeToken();
      if (tok) { try { await call('push:unsubscribe', { token: state.token, endpoint: `fcm:${tok}` }); } catch (e) { /* ignore */ } }
      try { localStorage.removeItem(FCM_KEY); } catch (e) { /* */ }
      try { await (await loadNative()).unregister(); } catch (e) { /* */ }
      toast(t('ההתראות כובו'));
    } catch (e) { toast(t('משהו השתבש. נסו שוב.')); }
    return;
  }
  try {
    const sub = await getPushSub();
    if (sub) {
      try { await call('push:unsubscribe', { token: state.token, endpoint: sub.endpoint }); } catch (e) { /* ignore */ }
      await sub.unsubscribe();
    }
    toast(t('ההתראות כובו'));
  } catch (e) { toast(t('משהו השתבש. נסו שוב.')); }
}

// בכל כניסה מחדשים את הרישום של המכשיר על שם מי שמחובר עכשיו (חשוב במכשיר משותף).
export async function syncPush() {
  if (state.pushSyncedFor === state.token) return;
  state.pushSyncedFor = state.token;
  if (!pushSupported()) return;
  if (isNative()) {
    // האסימון יכול להתחלף, ובמכשיר משותף הוא צריך לעבור למי שמחובר עכשיו.
    if (!savedNativeToken()) return;
    try {
      if ((await (await loadNative()).checkPermissions()).receive !== 'granted') return;
      await sendNativeToken(/** @type {string} */ (await registerNative()));
    } catch (e) { /* ignore */ }
    return;
  }
  if (Notification.permission !== 'granted') return;
  try { const sub = await getPushSub(); if (sub) await sendSubToServer(sub); } catch (e) { /* ignore */ }
}

export async function releasePushDevice() {
  if (!pushSupported()) return;
  if (isNative()) {
    try { const tok = savedNativeToken(); if (tok) await call('push:unsubscribe', { token: state.token, endpoint: `fcm:${tok}` }); } catch (e) { /* ignore */ }
    return;
  }
  try {
    // מסירים את המכשיר מהמשתמש הנוכחי בשרת. ההרשאה בדפדפן נשארת, והכניסה הבאה תרשום אותו מחדש.
    const sub = await getPushSub();
    if (sub) await call('push:unsubscribe', { token: state.token, endpoint: sub.endpoint });
  } catch (e) { /* ignore */ }
}
