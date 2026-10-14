import { state, DEVICE_KEY } from './state.js';

// מזהה מכשיר אקראי, רק להגבלת קצב של ניחושי קוד (לא מזהה אישי).
export function deviceId() {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      d = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch (e) { return undefined; }
}

const AUTH_CALLS = ['auth:enter', 'auth:join', 'auth:login', 'auth:claimProfile', 'emailAuth:requestResetCode', 'emailAuth:resetWithCode'];
export const call = (name, args) => state.client.mutation(name, AUTH_CALLS.includes(name) ? { ...args, device: deviceId() } : args);
