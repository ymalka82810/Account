import { client } from './client.js';
import { state } from '../state/state.js';
import { t } from '../i18n/index.js';
import { toast, errMsg } from './helpers.js';

// תור שליחה שנשמר במכשיר: רישומי חוב והחזר בקופה המשפחתית שנעשו בלי חיבור לשרת.
// הם נשמרים ב-localStorage ונשלחים כשהחיבור חוזר, גם אם האפליקציה נסגרה ונפתחה שוב בינתיים.
// כל רישום נושא clientId, והשרת (entries:add) מחזיר את אותה רשומה אם כבר קיבל אותו, ולכן שליחה חוזרת לא יוצרת כפילות.
const KEY = 'kupa-outbox-v1';
const MAX_JOBS = 50;

/** @typedef {{ id: string, token: string, args: Record<string, any>, at: number }} Job */

/** @returns {Job[]} */
function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((j) => j && typeof j.id === 'string' && j.args && typeof j.token === 'string') : [];
  } catch (e) { return []; }
}
/** @param {Job[]} jobs */
function write(jobs) {
  try { if (jobs.length) localStorage.setItem(KEY, JSON.stringify(jobs)); else localStorage.removeItem(KEY); } catch (e) { /* */ }
  listeners.forEach((fn) => fn(jobs.length));
}

/** @type {Set<(n: number) => void>} */
const listeners = new Set();
export const pendingCount = () => read().length;
/** @param {(n: number) => void} fn */
export function subscribePending(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function newClientId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isOffline = () => !!client && !client.connectionState().isWebSocketConnected;

/**
 * שומר רישום בתור. מחזיר false אם התור מלא.
 * @param {Record<string, any>} args ארגומנטים של entries:add (בלי token ובלי clientId)
 */
export function enqueueEntry(args) {
  const jobs = read();
  if (jobs.length >= MAX_JOBS || !state.token) return false;
  const id = newClientId();
  jobs.push({ id, token: state.token, args: { ...args, clientId: id }, at: Date.now() });
  write(jobs);
  void flush();
  return true;
}

let flushing = false;
export async function flush() {
  if (flushing || !client || isOffline()) return;
  flushing = true;
  try {
    for (;;) {
      const job = read()[0];
      if (!job) break;
      // תור של משתמש שיצא או התחלף לא נשלח, כדי שלא יירשם בשם מישהו אחר.
      if (job.token !== state.token) { write(read().slice(1)); continue; }
      try {
        await client.mutation(/** @type {any} */ ('entries:add'), /** @type {any} */ ({ ...job.args, token: job.token }));
        write(read().slice(1));
      } catch (e) {
        // השרת דחה את הרישום (למשל החוב כבר שולם): אין טעם לנסות שוב. מודיעים ומסירים.
        write(read().slice(1));
        toast(t('רישום שנשמר בלי חיבור לא נשלח: {err}', { err: errMsg(e) }));
      }
    }
  } finally { flushing = false; }
}

// שליחה בעת עליית החיבור, בפתיחת האפליקציה, וכשהרשת חוזרת.
export function startOutbox() {
  if (!client) return () => {};
  void flush();
  const off = client.subscribeToConnectionState((cs) => { if (cs.isWebSocketConnected) void flush(); });
  const onOnline = () => { void flush(); };
  window.addEventListener('online', onOnline);
  return () => { off(); window.removeEventListener('online', onOnline); };
}
