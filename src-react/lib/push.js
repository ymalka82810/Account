import { state } from '../state/state.js';
import { toast, errMsg } from './helpers.js';
import { call } from './api.js';

// ---------- התראות (Push) ----------
export const pushSupported = () => !!window.VAPID_PUBLIC_KEY && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window;

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
  try { return Notification.permission === 'granted' && !!(await getPushSub()); } catch (e) { return false; }
}

export async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('ההתראות חסומות. אפשר לאשר אותן בהגדרות הדפדפן.'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(window.VAPID_PUBLIC_KEY) });
    await sendSubToServer(sub);
    toast('ההתראות הופעלו 🔔');
  } catch (e) { toast(e && e.data ? errMsg(e) : 'לא הצלחנו להפעיל התראות במכשיר הזה'); }
}

export async function disablePush() {
  try {
    const sub = await getPushSub();
    if (sub) {
      try { await call('push:unsubscribe', { token: state.token, endpoint: sub.endpoint }); } catch (e) { /* ignore */ }
      await sub.unsubscribe();
    }
    toast('ההתראות כובו');
  } catch (e) { toast('משהו השתבש. נסו שוב.'); }
}

// בכל כניסה מחדשים את הרישום של המכשיר על שם מי שמחובר עכשיו (חשוב במכשיר משותף).
export async function syncPush() {
  if (state.pushSyncedFor === state.token) return;
  state.pushSyncedFor = state.token;
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try { const sub = await getPushSub(); if (sub) await sendSubToServer(sub); } catch (e) { /* ignore */ }
}

export async function releasePushDevice() {
  if (!pushSupported()) return;
  try {
    // מסירים את המכשיר מהמשתמש הנוכחי בשרת. ההרשאה בדפדפן נשארת, והכניסה הבאה תרשום אותו מחדש.
    const sub = await getPushSub();
    if (sub) await call('push:unsubscribe', { token: state.token, endpoint: sub.endpoint });
  } catch (e) { /* ignore */ }
}
