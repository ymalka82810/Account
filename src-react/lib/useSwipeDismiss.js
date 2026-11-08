// החלקה הצידה (ימינה או שמאלה) לסגירת הודעת מערכת: toast, באנר עדכון, באנר חוסר חיבור.
// מחזיר props לפיזור על האלמנט. האלמנט זז עם האצבע; אחרי סף מסוים (או החלקה מהירה) הוא יוצא מהמסך ו-onDismiss נקרא, אחרת חוזר למקומו.
// המצב נשמר ב-ref כדי שרינדור באמצע החלקה לא יאפס אותה.
// נגיעה רגילה (בלי תנועה אופקית) לא נבלעת, כך שכפתורים בתוך ההודעה ממשיכים לעבוד.
import { useRef } from 'react';

const START_PX = 8;
const DISMISS_PX = 60;
const FAST_PX_PER_MS = 0.5;
const OUT_MS = 160;

/** @param {() => void} onDismiss */
export function useSwipeDismiss(onDismiss) {
  /** @type {import('react').MutableRefObject<{ id: number, x: number, y: number, t: number, dx: number, active: boolean } | null>} */
  const ref = useRef(null);

  const reset = (/** @type {HTMLElement} */ el) => {
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
  };

  return {
    onPointerDown(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      ref.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, active: false };
    },
    onPointerMove(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      const drag = ref.current;
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dy) > START_PX && Math.abs(dy) > Math.abs(dx)) { ref.current = null; return; }
        if (Math.abs(dx) < START_PX) return;
        drag.active = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.transition = 'none';
      }
      drag.dx = dx;
      e.currentTarget.style.transform = `translateX(${dx}px)`;
      e.currentTarget.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 220));
    },
    onPointerUp(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      const d = ref.current;
      ref.current = null;
      if (!d || !d.active) return;
      const el = e.currentTarget;
      const fast = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t) > FAST_PX_PER_MS;
      if (Math.abs(d.dx) < DISMISS_PX && !fast) {
        el.style.transition = 'transform .18s ease, opacity .18s ease';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
        window.setTimeout(() => reset(el), 200);
        return;
      }
      el.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
      el.style.transform = `translateX(${d.dx > 0 ? '' : '-'}110vw)`;
      el.style.opacity = '0';
      window.setTimeout(() => { onDismiss(); reset(el); }, OUT_MS);
    },
    onPointerCancel(/** @type {import('react').PointerEvent<HTMLElement>} */ e) {
      if (ref.current?.active) reset(e.currentTarget);
      ref.current = null;
    },
  };
}
