// ---------- עזרים כלליים ----------
import { t, tn } from '../i18n/index.js';
import { translateServer } from '../i18n/serverMessages.js';

let toastTimer;
let toastMsg = '';
const toastListeners = new Set();
export const subscribeToast = (fn) => { toastListeners.add(fn); return () => toastListeners.delete(fn); };
export const toastMessage = () => toastMsg;
function setToast(m) { toastMsg = m; toastListeners.forEach((fn) => fn()); }
export function toast(msg) {
  setToast(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setToast(''), 2800);
}

export const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

// שגיאות מהשרת מגיעות כ-ConvexError עם טקסט בעברית ב-data. הטקסט העברי הוא גם המפתח לתרגום
// (ראו i18n/serverMessages.js לשגיאות עם מספרים בתוכן).
export function errMsg(e) {
  if (e && typeof e.data === 'string') return translateServer(e.data);
  if (!navigator.onLine) return t('אין חיבור לאינטרנט. נסו שוב כשיש.');
  return t('משהו השתבש. נסו שוב.');
}

// "דקה", "5 דקות", "שעה"... לפי מספר השניות שנשארו בנעילה.
export function fmtWait(sec) {
  if (sec < 90) return t('דקה');
  if (sec < 3600) return tn(Math.round(sec / 60), 'דקה', '{n} דקות');
  const h = Math.round(sec / 3600);
  return h === 1 ? t('שעה') : h === 2 ? t('שעתיים') : tn(h, 'שעה', '{n} שעות');
}

export function prettyCode(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > 5 ? c.slice(0, 5) + '-' + c.slice(5) : c;
}
