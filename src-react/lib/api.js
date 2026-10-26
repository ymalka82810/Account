import { DEVICE_KEY } from '../state/state.js';
import { useQuery as useConvexQuery } from 'convex/react';
import { client } from './client.js';

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

const AUTH_CALLS = ['auth:enter', 'auth:join', 'auth:createFamily','auth:login', 'auth:claimProfile', 'emailAuth:requestResetCode', 'emailAuth:resetWithCode'];

/**
 * קריאת mutation לפי שם. השם והארגומנטים נבדקים מול convex/ ב-`npm run typecheck`.
 * @template {MutationName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N>} args
 * @returns {Promise<import('./apiTypes').ReturnOf<N>>}
 */
export const call = (name, args) =>
  client.mutation(/** @type {any} */ (name), /** @type {any} */ (AUTH_CALLS.includes(name) ? { ...args, device: deviceId() } : args));

/**
 * @template {ActionName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N>} args
 * @returns {Promise<import('./apiTypes').ReturnOf<N>>}
 */
export const callAction = (name, args) => client.action(/** @type {any} */ (name), /** @type {any} */ (args));

/**
 * useQuery לפי שם, עם טיפוס התוצאה מהשרת. 'skip' = לא לשלוח.
 * @template {QueryName} N
 * @param {N} name
 * @param {import('./apiTypes').ArgsOf<N> | 'skip'} args
 * @returns {import('./apiTypes').ReturnOf<N> | undefined}
 */
export const useQuery = (name, args) => useConvexQuery(/** @type {any} */ (name), /** @type {any} */ (args));
