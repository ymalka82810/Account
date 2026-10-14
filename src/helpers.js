// ---------- עזרים כלליים ----------

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

// שגיאות מהשרת מגיעות כ-ConvexError עם טקסט בעברית ב-data.
export function errMsg(e) {
  if (e && typeof e.data === 'string') return e.data;
  if (!navigator.onLine) return 'אין חיבור לאינטרנט. נסו שוב כשיש.';
  return 'משהו השתבש. נסו שוב.';
}

// "דקה", "5 דקות", "שעה"... לפי מספר השניות שנשארו בנעילה.
export function fmtWait(sec) {
  if (sec < 90) return 'דקה';
  if (sec < 3600) return Math.round(sec / 60) + ' דקות';
  const h = Math.round(sec / 3600);
  return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות';
}

export function prettyCode(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > 5 ? c.slice(0, 5) + '-' + c.slice(5) : c;
}
