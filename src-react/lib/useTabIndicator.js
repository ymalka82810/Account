// הפס המודגש מתחת ללשונית הנבחרת: אלמנט אחד שמחליק בין הלשוניות במקום קו שקופץ.
// בלחיצה על לשונית הוא מחליק אליה בהדרגה; בזמן החלקת התוכן (useTabSwipe) הוא זז עם האצבע לעבר הלשונית הבאה,
// ובשחרור ממשיך אליה או חוזר למקום. המיקום נקבע ישירות על ה-style (בלי רינדור) כדי שיהיה חלק גם בזמן גרירה.
import { useRef, useLayoutEffect, useCallback } from 'react';
import { reducedMotion } from './motion.js';

const MOVE = 'transform 300ms cubic-bezier(.22, 1, .36, 1), width 300ms cubic-bezier(.22, 1, .36, 1)';

/**
 * @param {import('react').MutableRefObject<HTMLElement | null>} navRef סרגל הלשוניות
 * @param {string} tab הלשונית הנבחרת
 * @param {string[]} tabs
 */
export function useTabIndicator(navRef, tab, tabs) {
  /** @type {import('react').MutableRefObject<HTMLElement | null>} */
  const indRef = useRef(null);
  const placed = useRef(false);
  /** @type {import('react').MutableRefObject<Record<string, { l: number, w: number, t: number, h: number }> | null>} מדידות הלשוניות, כדי שבזמן גרירה לא יהיו קריאות layout בכל תזוזה */
  const geo = useRef(null);
  const lastBox = useRef('');

  const measure = (/** @type {string} */ id) => {
    const cache = (geo.current ??= {});
    if (!cache[id]) {
      const el = /** @type {HTMLElement | null} */ (navRef.current?.querySelector(`[data-tab="${id}"]`) ?? null);
      if (!el) return null;
      cache[id] = { l: el.offsetLeft, w: el.offsetWidth, t: el.offsetTop, h: el.offsetHeight };
    }
    return cache[id];
  };

  // מציב את הפס בין הלשונית הנוכחית ללשונית next, לפי progress (0 = על הנוכחית, 1 = על next).
  const place = useCallback((/** @type {string | null} */ next, /** @type {number} */ progress, /** @type {boolean} */ animate) => {
    const ind = indRef.current;
    const a = measure(tab);
    if (!ind || !a) return;
    const b = next ? measure(next) : null;
    const p = b ? progress : 0;
    const left = a.l + ((b ? b.l : a.l) - a.l) * p;
    const width = a.w + ((b ? b.w : a.w) - a.w) * p;
    ind.style.transition = animate && placed.current && !reducedMotion() ? MOVE : 'none';
    ind.style.transform = `translateX(${left}px)`;
    ind.style.width = `${width}px`;
    // לנוער הפס הוא "גלולה" מאחורי כל הלשונית, אז גם הגובה והמיקום האנכי של הלשונית זמינים ל-CSS.
    const box = `${a.t}:${a.h}`;
    if (box !== lastBox.current) {
      lastBox.current = box;
      ind.style.setProperty('--ind-top', `${a.t}px`);
      ind.style.setProperty('--ind-h', `${a.h}px`);
    }
    ind.style.opacity = '1';
    placed.current = true;
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // לשונית חדשה (בלחיצה או בסוף החלקה): הפס מחליק אליה. שינוי גודל (סיבוב מסך, שפה) מציב מחדש בלי אנימציה.
  useLayoutEffect(() => {
    geo.current = null;
    place(null, 0, true);
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return undefined;
    // ResizeObserver מדווח גם מיד בהתחלה; מציבים מחדש רק כשהרוחב באמת השתנה, כדי לא לעצור את ההחלקה.
    // גם הלשוניות עצמן נצפות: גופן שנטען או תווית שהתחלפה משנים את הרוחב שלהן בלי לשנות את הסרגל.
    const key = () => [...nav.children].map((c) => (c instanceof HTMLElement && c !== indRef.current ? `${c.offsetLeft}:${c.offsetWidth}` : '')).join();
    let last = key();
    const ro = new ResizeObserver(() => {
      const k = key();
      if (k === last) return;
      last = k;
      geo.current = null;
      place(null, 0, false);
    });
    ro.observe(nav);
    for (const c of nav.children) if (c !== indRef.current) ro.observe(c);
    return () => ro.disconnect();
  }, [place, tabs.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return { indRef, place };
}
