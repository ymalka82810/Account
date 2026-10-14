import { useConvex } from 'convex/react';
import { toast, errMsg } from '../../src/helpers.js';

// run(שם פעולה, פרמטרים, הודעת הצלחה): מריץ mutation עם הטוקן ומציג הודעה.
export function useRun(token) {
  const convex = useConvex();
  return async function run(name, args, okMsg) {
    try { await convex.mutation(name, { token, ...args }); toast(okMsg); }
    catch (e) { toast(errMsg(e)); }
  };
}
