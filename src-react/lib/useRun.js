import { call } from './api.js';
import { toast, errMsg } from './helpers.js';

// run(שם פעולה, פרמטרים, הודעת הצלחה): מריץ mutation עם הטוקן ומציג הודעה.
export function useRun(token) {
  return async function run(name, args, okMsg) {
    try { await call(name, { token, ...args }); toast(okMsg); }
    catch (e) { toast(errMsg(e)); }
  };
}
