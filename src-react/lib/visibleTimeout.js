// טיימר שסופר רק זמן שהדף גלוי ופועל.
// הבעיה ב-setTimeout רגיל: כשיוצאים מהדף (או ממזערים את האפליקציה) הדפדפן או אנדרואיד מקפיאים את הדף
// ואת חיבור ה-WebSocket. בחזרה, טיימר שנקבע לפני היציאה מופעל מיד, לפני שהחיבור הספיק לחזור,
// ומוצג "אין חיבור לשרת" בטעות. כאן כל יציאה מהדף מאפסת את הספירה, ובחזרה סופרים מחדש מאפס.
const TICK_MS = 250;

/**
 * @param {() => void} fn נקרא פעם אחת, אחרי ms של זמן שהדף היה גלוי ברצף
 * @param {number} ms
 * @returns {() => void} ביטול
 */
export function visibleTimeout(fn, ms) {
  let counted = 0;
  let last = Date.now();
  const reset = () => { counted = 0; last = Date.now(); };
  const stop = () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', reset);
  };
  const id = setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (document.visibilityState !== 'visible') { counted = 0; return; }
    // הפסקה ארוכה בין שתי פעימות פירושה שהדף הוקפא: לא סופרים אותה
    if (gap <= TICK_MS * 4) counted += gap;
    if (counted >= ms) { stop(); fn(); }
  }, TICK_MS);
  document.addEventListener('visibilitychange', reset);
  return stop;
}
