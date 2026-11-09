// בקשת הצטרפות שנשלחה ועוד ממתינה להורה. נשמרת במכשיר כדי שהמצב יישאר גלוי גם אחרי רענון או יציאה מהמסך.
// requestId הוא סוד של המכשיר ששלח את הבקשה: רק איתו אפשר לראות את מצבה (auth:joinStatus).
const KEY = 'kupa-join-pending';

/** @returns {{ requestId: string, name: string, sentAt: number } | null} */
export function getJoinPending() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o && typeof o.requestId === 'string' && o.requestId ? { requestId: o.requestId, name: String(o.name || ''), sentAt: Number(o.sentAt) || Date.now() } : null;
  } catch (e) { return null; }
}
export function setJoinPending(/** @type {string} */ requestId, /** @type {string} */ name) {
  try { localStorage.setItem(KEY, JSON.stringify({ requestId, name, sentAt: Date.now() })); } catch (e) { /* */ }
}
export function clearJoinPending() {
  try { localStorage.removeItem(KEY); } catch (e) { /* */ }
}
