// "חנות" קטנה שמודיעה לקומפוננטות ה-React של מסכי הכניסה שה-state (view, fam,
// pinFlow, legacyPeople, ...) השתנה. session.js קורא ל-bumpAuth() בכל route().
let version = 0;
const listeners = new Set();
export const subscribeAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const authVersion = () => version;
export function bumpAuth() {
  version += 1;
  listeners.forEach((fn) => fn());
}
