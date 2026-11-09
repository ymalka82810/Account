// החלקה הצידה על תוכן המסך הראשי מעבירה ללשונית הסמוכה, לפי סדר הלשוניות בתפריט.
// הלשונית הנוכחית זזה עם האצבע; אחרי סף (או החלקה מהירה) היא יוצאת בהחלקה רגועה והלשונית הבאה נכנסת מהצד השני.
// בעברית (RTL) הלשונית הראשונה בימין, אז אצבע שזזה ימינה מושכת את הדף וחושפת את הלשונית שמשמאל - הבאה בסדר.
// גלילה אנכית נשארת של הדפדפן (touch-action: pan-y). לא מתחילים החלקה משדות קלט, ולא מתוך שורה שנגללת לרוחב
// (כמו שורת הדמויות) כל עוד היא יכולה עוד לגלול לכיוון הזה. רק מגע (לא עכבר), כדי לא להפריע לבחירת טקסט במחשב.
// חלקות: כל המדידות (כיוון, רוחב) נעשות פעם אחת בתחילת ההחלקה, והתזוזה עצמה נכתבת פעם אחת לכל פריים (rAF).
// החלק העליון (כותרת ולשוניות) לא זז: בזמן ההחלקה אין גלילה של הדף, ובהחלפת הלשונית מיקום הגלילה נשמר.
import { useRef, useLayoutEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { reducedMotion } from './motion.js';

const START_PX = 10;
const COMMIT_RATIO = 0.22;
const FAST_PX_PER_MS = 0.45;
const OUT_MS = 200;
const IN_MS = 300;
const SHIFT = 0.35; // כמה מרוחב המסך הלשונית זזה ביציאה/בכניסה
const EASE_OUT = 'cubic-bezier(.4, 0, 1, 1)';
const EASE_IN = 'cubic-bezier(.22, 1, .36, 1)';
const NO_SWIPE = 'input, textarea, select, [contenteditable="true"], [data-no-swipe], .kb';

const isRtl = () => getComputedStyle(document.documentElement).direction === 'rtl';

// האם יש בין האלמנט שנגעו בו לבין main אלמנט שעוד יכול לגלול לרוחב בכיוון של האצבע.
function innerScrolls(/** @type {Element | null} */ from, /** @type {HTMLElement} */ root, /** @type {number} */ dx) {
  for (let el = from; el && el !== root; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') continue;
    // scrollLeft ב-RTL הוא 0 בהתחלה ושלילי כשגוללים; Math.abs מאחד את שני המקרים.
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    const rtl = getComputedStyle(el).direction === 'rtl';
    // אצבע ימינה (dx>0) חושפת תוכן משמאל: ב-LTR זה רק אם כבר גללו (pos>0), ב-RTL רק אם לא הגיעו לסוף.
    const towardStart = rtl ? dx < 0 : dx > 0;
    if (towardStart ? pos > 1 : pos < max - 1) return true;
  }
  return false;
}

// גובה מינימלי למעטפת בלי אנימציית מעבר (ל-#screen-app יש transition: all, והגובה החדש היה מתעדכן רק בפריים הבא,
// כך שהגלילה נחתכת בדיוק ברגע שצריך לשמור אותה).
function setShellMin(/** @type {HTMLElement | null | undefined} */ shell, /** @type {string} */ value) {
  if (!shell) return;
  shell.style.transition = 'none';
  shell.style.minHeight = value;
  void shell.offsetHeight;
  requestAnimationFrame(() => { shell.style.transition = ''; });
}

/**
 * @param {string[]} tabs הלשוניות לפי הסדר בתפריט
 * @param {string} tab הלשונית הנוכחית
 * @param {(id: string) => void} setTab
 * @param {((next: string | null, progress: number, animate: boolean) => void) | undefined} onDrag
 *   מדווח על ההתקדמות לפס הלשונית (useTabIndicator): לאיזו לשונית הולכים ועד כמה (0 עד 1). null = חזרה למקום.
 */
export function useTabSwipe(tabs, tab, setTab, onDrag = undefined) {
  /** @type {import('react').MutableRefObject<HTMLElement | null>} */
  const rootRef = useRef(null);
  /** @type {import('react').MutableRefObject<{ id: number, x: number, y: number, t: number, dx: number, ox: number, active: boolean, target: Element | null, rtl: boolean, width: number } | null>} */
  const drag = useRef(null);
  /** @type {import('react').MutableRefObject<number>} כיוון הכניסה של הלשונית הבאה: 1 מימין, -1 משמאל, 0 בלי אנימציה */
  const enterFrom = useRef(0);
  const busy = useRef(false);
  const suppressClick = useRef(false);
  /** @type {import('react').MutableRefObject<string>} הלשונית שהמעטפת הוגדלה בשבילה (commit); ה-layout effect לא מנקה אותה */
  const holdFor = useRef('');

  // בזמן החלקה פעילה הדף לא גולל (אחרת הכותרת והלשוניות זזות יחד עם האצבע). מאזין לא-פסיבי חייב להיות native.
  const blockTouchMove = useCallback((/** @type {TouchEvent} */ e) => {
    if (drag.current?.active && e.cancelable) e.preventDefault();
  }, []);
  // ref כפונקציה: ה-main לא תמיד קיים בעליית הקומפוננטה (למשל בזמן DeviceGate), והמאזין מתחבר כשהוא מופיע.
  const setRoot = useCallback((/** @type {HTMLElement | null} */ node) => {
    rootRef.current?.removeEventListener('touchmove', blockTouchMove);
    rootRef.current = node;
    node?.addEventListener('touchmove', blockTouchMove, { passive: false });
  }, [blockTouchMove]);

  const panel = () => /** @type {HTMLElement | null} */ (rootRef.current?.querySelector(':scope > .panel.active') ?? null);

  // הלשונית הסמוכה לכיוון האצבע, או null בקצוות. כמו דפדוף בדף אמיתי: האצבע מושכת את התוכן הצידה וחושפת את
  // הלשונית שנמצאת בתפריט בצד השני. ב-RTL (הבאה משמאל) אצבע ימינה מביאה את הבאה; ב-LTR אצבע שמאלה.
  const neighbor = (/** @type {number} */ dx, /** @type {boolean} */ rtl) => {
    const i = tabs.indexOf(tab);
    if (i < 0) return null;
    const forward = rtl ? dx > 0 : dx < 0;
    return tabs[i + (forward ? 1 : -1)] ?? null;
  };

  const clearStyles = (/** @type {Element | null} */ el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
  };

  const finish = () => {
    busy.current = false;
    rootRef.current?.classList.remove('swiping');
  };

  // חזרה רכה למקום (שחרור לפני הסף, או ביטול המגע).
  const snapBack = (/** @type {HTMLElement | null} */ el) => {
    onDrag?.(null, 0, true);
    if (!el) { finish(); return; }
    el.style.transition = `transform 220ms ${EASE_IN}, opacity 220ms ${EASE_IN}`;
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    window.setTimeout(() => { clearStyles(el); finish(); }, 240);
  };

  // מחליף לשונית בציור סינכרוני אחד (בלי פריים ביניים שבו הלשונית הישנה חוזרת להיראות).
  // setTab גולל לראש הדף; כאן שומרים את הגלילה כדי שהכותרת והלשוניות לא יקפצו: אם הכותרת כבר גלולה החוצה
  // הלשוניות נשארות צמודות למעלה והתוכן החדש מתחיל מתחתן, ואם היא נראית חלקית היא נשארת בדיוק איפה שהייתה.
  const commit = (/** @type {string} */ next, /** @type {number} */ scrollY) => {
    setShellMin(rootRef.current?.parentElement, '');
    holdFor.current = next;
    flushSync(() => setTab(next));
    const h = document.querySelector('header.top');
    const max = h instanceof HTMLElement ? h.offsetTop + h.offsetHeight : 0;
    const target = Math.min(scrollY, max);
    // לשונית קצרה מהקודמת: אין לדף מספיק גובה לשמור את הגלילה, והדפדפן היה מקצר אותה והכותרת הייתה קופצת פנימה.
    // מגדילים זמנית את גובה המעטפת (#root) עד שהמיקום אפשרי; מתנקה בהחלפת הלשונית הבאה.
    const shell = rootRef.current?.parentElement;
    if (shell && document.documentElement.scrollHeight < target + window.innerHeight) {
      setShellMin(shell, `${target + window.innerHeight}px`);
    }
    window.scrollTo(0, target);
  };

  // אחרי שהלשונית התחלפה: הלשונית החדשה נכנסת מהצד שממנו הגיעה, והישנה (שנשארה שקופה ומוסטת) מתנקה.
  useLayoutEffect(() => {
    if (holdFor.current !== tab) setShellMin(rootRef.current?.parentElement, '');
    for (const p of rootRef.current?.querySelectorAll(':scope > .panel:not(.active)') ?? []) clearStyles(p);
    const from = enterFrom.current;
    enterFrom.current = 0;
    if (!from) return;
    const el = panel();
    if (!el || reducedMotion()) { clearStyles(el); finish(); return; }
    el.style.transition = 'none';
    el.style.transform = `translateX(${from * SHIFT * 100}%)`;
    el.style.opacity = '0';
    void el.offsetWidth;
    el.style.transition = `transform ${IN_MS}ms ${EASE_IN}, opacity ${IN_MS}ms ${EASE_IN}`;
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
    const t = window.setTimeout(() => { clearStyles(el); finish(); }, IN_MS + 30);
    return () => { window.clearTimeout(t); clearStyles(el); finish(); };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const props = {
    ref: setRoot,
    style: { touchAction: 'pan-y' },
    onPointerDown(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      suppressClick.current = false;
      if (e.pointerType !== 'touch' || busy.current || tabs.length < 2) return;
      const target = /** @type {Element} */ (e.target);
      if (target.closest?.(NO_SWIPE)) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, ox: 0, active: false, target, rtl: false, width: 0 };
    },
    onPointerMove(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        if (Math.abs(dy) > START_PX && Math.abs(dy) >= Math.abs(dx)) { drag.current = null; return; }
        if (Math.abs(dx) < START_PX || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        if (innerScrolls(d.target, e.currentTarget, dx)) { drag.current = null; return; }
        d.active = true;
        // כל מה שדורש מדידה נקבע פעם אחת כאן, ולא בכל תזוזה (קריאות layout באמצע גרירה גורמות לקטיעות).
        d.rtl = isRtl();
        d.width = e.currentTarget.clientWidth || window.innerWidth;
        // התוכן מתחיל לזוז מנקודת ההפעלה ולא קופץ בבת אחת את מרחק הסף.
        d.ox = dx;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        e.currentTarget.classList.add('swiping');
        const el = panel();
        if (el) el.style.transition = 'none';
      }
      d.dx = dx;
      const el = panel();
      if (!el) return;
      // בקצה (אין לשונית לשם) - תזוזה קטנה ומתנגדת, רק כדי להרגיש שאין לאן.
      const next = neighbor(dx, d.rtl);
      const rel = dx - d.ox;
      const move = next ? rel : rel * 0.2;
      onDrag?.(next, next ? Math.min(1, Math.abs(dx) / d.width) : 0, false);
      el.style.transform = `translateX(${move}px)`;
      el.style.opacity = String(Math.max(0.4, 1 - Math.abs(move) / (d.width * 1.2)));
    },
    onPointerUp(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      const d = drag.current;
      drag.current = null;
      if (!d || !d.active) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 350);
      const el = panel();
      const next = neighbor(d.dx, d.rtl);
      const width = d.width;
      const fast = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t) > FAST_PX_PER_MS;
      if (!el || !next || (Math.abs(d.dx) < width * COMMIT_RATIO && !fast)) { snapBack(el); return; }
      busy.current = true;
      onDrag?.(next, 1, true);
      const dir = d.dx > 0 ? 1 : -1;
      const scrollY = window.scrollY;
      if (reducedMotion()) { clearStyles(el); finish(); commit(next, scrollY); return; }
      el.style.transition = `transform ${OUT_MS}ms ${EASE_OUT}, opacity ${OUT_MS}ms ${EASE_OUT}`;
      el.style.transform = `translateX(${dir * Math.max(Math.abs(d.dx), width * SHIFT)}px)`;
      el.style.opacity = '0';
      window.setTimeout(() => {
        // הלשונית הישנה נשארת שקופה במקומה עד שהחדשה מצוירת (נוקתה ב-layout effect), בלי הבהוב באמצע.
        // הלשונית החדשה נכנסת מהצד ההפוך לתנועת האצבע.
        enterFrom.current = -dir;
        commit(next, scrollY);
      }, OUT_MS);
    },
    onPointerCancel() {
      const d = drag.current;
      drag.current = null;
      if (d?.active) snapBack(panel());
    },
    // אחרי החלקה לא נחשב לחיצה על כפתור שהאצבע התחילה עליו.
    onClickCapture(/** @type {import('react').MouseEvent} */ e) {
      if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
    },
  };
  return props;
}
