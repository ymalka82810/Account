import { DEVICE_KEY, state } from '../state/state.js';
import { useQuery as useConvexQuery } from 'convex/react';
import { client } from './client.js';
import { isDemo, demoQuery } from './demo.js';
import { t } from '../i18n/index.js';

// במצב דמו אין שרת: כל שינוי נדחה, וה-toast של הכשל מציג את ההסבר.
const demoBlocked = () => Promise.reject(Object.assign(new Error('demo'), { data: t('זה דמו, אז אי אפשר לשנות כלום. הקימו קופה משלכם!') }));

/** @typedef {import('./apiTypes').QueryName} QueryName */
/** @typedef {import('./apiTypes').MutationName} MutationName */
/** @typedef {import('./apiTypes').ActionName} ActionName */

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

const AUTH_CALLS = ['auth:enter', 'auth:join', 'auth:createFamily', 'auth:login', 'auth:claimProfile', 'auth:enterFree', 'googleLink:resetWithProof',
  'biometric:loginChallenge', 'deviceMove:moveStart', 'deviceMove:addDeviceStart', 'deviceMove:recoveryRequest', 'deviceMove:recoveryConfirm', 'deviceMove:recoveryFinish'];

/**
 * קריאת mutation לפי שם. השם והארגומנטים נבדקים מול convex/ ב-`npm run typecheck`.
 * @template {MutationName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N>} args
 * @returns {Promise<import('./apiTypes').ReturnOf<N>>}
 */
export const call = (name, args) =>
  isDemo(state.token) ? demoBlocked() : client.mutation(/** @type {any} */ (name), /** @type {any} */ (AUTH_CALLS.includes(name) ? { ...args, device: deviceId() } : args));

/**
 * @template {ActionName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N>} args
 * @returns {Promise<import('./apiTypes').ReturnOf<N>>}
 */
export const callAction = (name, args) =>
  isDemo(state.token) ? demoBlocked() : client.action(/** @type {any} */ (name), /** @type {any} */ (args));

// השרת לא מכיר את הטוקן (יציאה, פג תוקף): אותה הודעה שה-App בודק בשליחת הפנקס (requirePerson בשרת).
const isSessionGone = (e) => !!e && typeof e.data === 'string' && e.data.includes('צריך להיכנס מחדש');

/**
 * useQuery לפי שם, עם טיפוס התוצאה מהשרת. 'skip' = לא לשלוח.
 * @template {QueryName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N> | 'skip'} args
 * @returns {import('./apiTypes').ReturnOf<N> | undefined}
 */
export const useQuery = (name, args) => {
  const demo = isDemo(state.token) && args !== 'skip' && name !== 'auth:legacyRoster';
  let res;
  try {
    res = useConvexQuery(/** @type {any} */ (name), /** @type {any} */ (demo ? 'skip' : args));
  } catch (e) {
    // Convex זורק את שגיאת השאילתה רק אחרי שכל ה-hooks רצו, ולכן אפשר לתפוס אותה כאן בבטחה.
    // כניסה שהשרת כבר לא מכיר (יציאה: הסשן נמחק לפני שהטוקן נוקה מהמכשיר) היא לא תקלה: אין מה להציג,
    // וה-App סוגר את הכניסה לבד. בלי זה שאילתה של הורה (למשל biometric:deviceStatus) הפילה את כל האפליקציה ל"נסו שוב".
    if (!isSessionGone(e)) throw e;
    res = undefined;
  }
  return demo ? /** @type {any} */ (demoQuery(name)) : res;
};
