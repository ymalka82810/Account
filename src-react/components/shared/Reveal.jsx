import { useLayoutEffect, useRef, useState } from 'react';
import { canAnimate, gapOf, slide } from '../../lib/motion.js';

// קטע שמופיע ונעלם בהחלקה לפי show, במקום לקפוץ פנימה והחוצה. בזמן ההיעלמות נשארת התצוגה האחרונה.
// appear: גם ההופעה הראשונה מונפשת (לדוגמה הודעת שגיאה שנוצרת כבר מוצגת).
export default function Reveal({ show, appear, children }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [mounted, setMounted] = useState(!!show);
  const kept = useRef(children);
  const prev = useRef(appear ? !show : !!show);
  if (show) {
    kept.current = children;
    if (!mounted) setMounted(true);
  }

  useLayoutEffect(() => {
    if (prev.current === !!show) return;
    prev.current = !!show;
    const el = ref.current;
    if (!el || !canAnimate(el)) {
      if (!show) setMounted(false);
      return;
    }
    slide(el, !!show, gapOf(el), () => { if (!show) setMounted(false); });
  }, [show]);

  return mounted ? <div ref={ref}>{kept.current}</div> : null;
}
