import { t } from '../i18n/index.js';
import { state } from '../state/state.js';
import { toast, errMsg } from './helpers.js';
import { call, callAction } from './api.js';

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

// ערוץ ההתראות באנדרואיד (אותו שם כמו ANDROID_CHANNEL בשרת). חשיבות גבוהה = ההתראה קופצת למעלה עם צליל ורטט.
const CHANNEL = 'kupa';
const TABS = ['home', 'friends', 'history', 'family', 'manage'];
const openTab = (/** @type {unknown} */ tab) => {
  if (typeof tab === 'string' && TABS.includes(tab) && location.hash !== '#' + tab) location.hash = '#' + tab;
};
async function ensureChannel() {
  try {
    await (await loadNative()).createChannel({ id: CHANNEL, name: t('התראות הקופה'), importance: 5, visibility: 1, vibration: true });
  } catch (e) { /* אנדרואיד ישן בלי ערוצים */ }
}

// מאזינים פעם אחת בעליית האפליקציה:
// - התראה שמגיעה כשהאפליקציה פתוחה: אנדרואיד לא מציג אותה בשורת ההתראות, אז מציגים אותה בתוך האפליקציה.
// - לחיצה על התראה: פותחים את הלשונית שהשרת ציין (למשל "ניהול" לבקשת הצטרפות).
let listening = false;
export async function initPushListeners() {
  if (listening || !nativeSupported()) return;
  listening = true;
  try {
    const PN = await loadNative();
    await ensureChannel();
    await PN.addListener('pushNotificationReceived', (/** @type {any} */ n) => {
      const text = [n.title, n.body].filter(Boolean).join(' · ');
      if (text) toast(text);
    });
    await PN.addListener('pushNotificationActionPerformed', (/** @type {any} */ a) => openTab(a && a.notification && a.notification.data && a.notification.data.tab));
  } catch (e) { /* בלי הפלאגין אין מאזינים, והאפליקציה עובדת כרגיל */ }
}

// התראת ניסיון לכל המכשירים של מי שמחובר, ומה קרה בדרך.
export async function testPush() {
  try {
    const r = await callAction('pushSend:test', { token: state.token });
    const devices = r.web.devices + r.android.devices;
    const sent = r.web.sent + r.android.sent;
    if (!devices) toast(t('המכשיר הזה עוד לא רשום להתראות. כבו והפעילו אותן מחדש.'));
    else if (sent === devices) toast(t('נשלחה התראת ניסיון ל-{n} מכשירים. היא אמורה להופיע עוד רגע.', { n: sent }));
    else toast(t('התראת הניסיון הגיעה ל-{sent} מתוך {n} מכשירים ({why})', { sent, n: devices, why: r.errors.join(', ') || '?' }));
  } catch (e) { toast(errMsg(e)); }
}

// מבקש אסימון FCM מהמכשיר. נפתר עם האסימון, או נדחה אם הרישום נכשל.
async function registerNative() {
  const PN = await loadNative();
  return new Promise((resolve, reject) => {
    /** @type {any[]} */
    const handles = [];
    const done = (/** @type {() => void} */ fn) => { handles.forEach((h) => h.remove()); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error(t('אין תשובה מ-Firebase אחרי 20 שניות')))), 20000);
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

// כל שלב בהפעלה (בקשת הרשאה, רישום ב-FCM, service worker, שמירה בשרת) יכול להיתקע בלי להיכשל, והכפתור היה נשאר על "רגע…" לנצח.
// לכן ההפעלה כולה מוגבלת בזמן: אחרי הזמן הזה הכפתור משתחרר ומוצגת הודעת כשל.
const ENABLE_TIMEOUT_MS = 45000;

// הסיבה הטכנית לכשל (טקסט השגיאה מאנדרואיד / Firebase / הדפדפן / השרת), כדי שאפשר יהיה לראות מה נכשל ולא רק "לא הצלחנו".
function errDetail(/** @type {any} */ e) {
  if (!e) return '';
  if (typeof e.data === 'string') return errMsg(e);
  if (typeof e.error === 'string') return e.error;
  if (e.error && typeof e.error.message === 'string') return e.error.message;
  if (typeof e.message === 'string' && e.message) return e.message;
  if (typeof e.code === 'string') return e.code;
  try { return typeof e === 'string' ? e : JSON.stringify(e); } catch (x) { return String(e); }
}
const STAGES = {
  permission: () => t('בקשת הרשאה'),
  register: () => t('רישום ב-Firebase'),
  worker: () => t('הכנת הדפדפן'),
  server: () => t('שמירה בשרת'),
};
/** @typedef {keyof typeof STAGES} Stage */

// מפעיל התראות. מחזיר '' בהצלחה, או טקסט שמסביר באיזה שלב זה נכשל ולמה (מוצג מתחת לכפתור).
export async function enablePush() {
  /** @type {{ stage: Stage }} */
  const at = { stage: 'permission' };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {Promise<string>} */
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(t('לא הצלחנו להפעיל התראות: {stage} לא הגיב תוך 45 שניות', { stage: STAGES[at.stage]() })), ENABLE_TIMEOUT_MS);
  });
  /** @type {Promise<string>} */
  const run = enablePushNow(at).then(() => '', (/** @type {any} */ e) => {
    if (e && e.denied) return t('ההתראות חסומות. אפשר לאשר אותן בהגדרות הטלפון או הדפדפן.');
    const d = errDetail(e);
    console.error('enablePush failed at', at.stage, e);
    return t('לא הצלחנו להפעיל התראות. שלב: {stage}. סיבה: {detail}', { stage: STAGES[at.stage](), detail: d || '?' });
  });
  try {
    const err = await Promise.race([run, timeout]);
    toast(err || t('ההתראות הופעלו 🔔'));
    return err;
  } finally { clearTimeout(timer); }
}

async function enablePushNow(/** @type {{ stage: Stage }} */ at) {
  if (isNative()) {
    const PN = await loadNative();
    at.stage = 'permission';
    const perm = await PN.requestPermissions();
    if (perm.receive !== 'granted') throw { denied: true };
    await ensureChannel();
    at.stage = 'register';
    const tok = /** @type {string} */ (await registerNative());
    at.stage = 'server';
    await sendNativeToken(tok);
    return;
  }
  at.stage = 'permission';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw { denied: true };
  at.stage = 'worker';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  at.stage = 'register';
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(window.VAPID_PUBLIC_KEY) });
  at.stage = 'server';
  await sendSubToServer(sub);
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
