import { call } from './api.js';
import { toast, errMsg } from './helpers.js';

// run(שם פעולה, פרמטרים, הודעת הצלחה): מריץ mutation עם הטוקן ומציג הודעה.
export function useRun(token) {
  /**
   * @template {import('./apiTypes').MutationName} N
   * @param {N} name
   * @param {Omit<import('./apiTypes').ArgsOf<N>, 'token'>} args
   * @param {string} [okMsg]
   */
  return async function run(name, args, okMsg) {
    try { await call(name, /** @type {any} */ ({ token, ...args })); toast(okMsg); }
    catch (e) { toast(errMsg(e)); }
  };
}
