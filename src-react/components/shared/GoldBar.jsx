import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { money } from '../../lib/computations.js';
import { playCoinSound } from '../../lib/coinSound.js';

// מטיל הזהב עצמו (המתכת, הפאות והחותמת 999.9) הוא תמונה שרונדרה ב-Blender (public/bars/<theme>-<get|owe>.webp,
// ראו scripts/blender/bar.py), ונקבעת ב-CSS לפי תפקיד וסוג (.sum::before). הגיאומטריה של התמונה זהה לקו המתאר
// כאן (viewBox 202x124), כך שהטקסט ממשיך לשבת על החזית.
// ה-SVG הזה נשאר רק לשכבות הנוער מעל התמונה: בוהק ניאון קבוע, ברק שעובר על המטיל וקו מתאר דק (מוצגים רק בעיצוב נוער).
// הברק כ"מישור אור" שעובר על המטיל משמאל לימין. לכל פאה (חזית, משטח עליון, צד ימין) מחושב היכן המישור חותך אותה
// לפי הגיאומטריה התלת-ממדית של התמונה, כך שבקצה בין פאות הפס מתקפל ונשבר (כמו סרט שמתקפל על קצה) ולא ממשיך ישר.
// d: הפאה על המסך (חופפות מעט בתפרים כדי שלא יישאר קו רווח). m: מיפוי מ"מרחב הפס" (פס אנכי שזז ב-x) אל הפאה.
// המטריצות חושבו מנקודות הפינה של המטיל בתמונה, עם עומק של 30 יחידות פס לחציית עובי המטיל.
const FACETS = [
  { id: 'front', d: 'M-0.4 -0.3L37.2 -0.4L29.6 20.2L163.0 20.4L172.4 117.7L-0.3 124.4Z', m: 'matrix(1.0000 0 -0.4040 1 -0.00 0)' },
  { id: 'top1', d: 'M29.5 20.5L163.0 20.6L173.5 7.4Z', m: 'matrix(1.0000 0 1.5000 1 -39.03 0)' },
  { id: 'top2', d: 'M29.5 20.6L173.5 7.5L37.5 5.9Z', m: 'matrix(1.0017 0 1.5207 1 -39.52 0)' },
  { id: 'side1', d: 'M162.4 20.0L173.0 7.0L172.0 117.9Z', m: 'matrix(0.3224 0 -0.0638 1 108.76 0)' },
  { id: 'side2', d: 'M172.9 7.0L196.9 79.3L171.9 117.9Z', m: 'matrix(0.6614 0 -0.1213 1 41.12 0)' },
];

const OUTLINE = 'M5.7 112.8Q4.0 119.6 11.0 119.6L167.0 119.6Q174.0 119.6 178.0 113.9L194.1 90.9Q198.1 85.2 196.1 78.5L175.9 10.7Q173.9 4.0 166.9 4.0L46.9 4.0Q39.9 4.0 35.9 9.7L32.2 15.0Q28.2 20.7 26.5 27.5Z';

export function GoldBarArt() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = (s) => `gb${s}${id}`;
  const url = (s) => `url(#${n(s)})`;
  const stop = (offset, color, opacity) => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity ?? 1 }} />;
  return (
    <svg className="gb-art" viewBox="0 0 202 124" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={n('c')}><path d={OUTLINE} /></clipPath>
        {FACETS.map((f) => <clipPath key={f.id} id={n(f.id)}><path d={f.d} /></clipPath>)}
        <linearGradient id={n('s')} x1="0" y1="0" x2="1" y2="0">
          {stop(0, 'var(--neon-a, #b04dff)', 0)}{stop(0.3, 'var(--neon-a, #b04dff)', 0.75)}{stop(0.5, '#fff', 0.85)}
          {stop(0.7, 'var(--neon-b, #22d8ff)', 0.75)}{stop(1, 'var(--neon-b, #22d8ff)', 0)}
        </linearGradient>
        <linearGradient id={n('g')} x1="0" y1="0" x2="1" y2="1">
          {stop(0, 'var(--neon-a, #b04dff)', 0.28)}{stop(0.5, 'var(--neon-a, #b04dff)', 0.04)}{stop(1, 'var(--neon-b, #22d8ff)', 0.34)}
        </linearGradient>
      </defs>
      <g clipPath={url('c')}>
        {/* נוער: בוהק ניאון קבוע ועדין, וברק שעובר על המטיל ונשבר בנפרד על כל משטח שלו */}
        <rect className="gb-glow" x="0" y="0" width="202" height="124" fill={url('g')} />
        {/* פס אחד רציף שעובר על כל הפאות ונשבר בקצוות לפי כיוון כל פאה */}
        {FACETS.map((f) => (
          <g key={f.id} clipPath={url(f.id)}>
            <g transform={f.m}>
              <g className="gb-shine">
                <rect x="-110" y="-60" width="50" height="260" fill={url('s')} />
              </g>
            </g>
          </g>
        ))}
      </g>
      {/* נוער: קו מתאר ניאון דק לאורך המתאר המעוגל */}
      <path className="gb-rim" d={OUTLINE} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// אחרי כמה זמן המספר מתחיל לרוץ: כשמטילים עפים אל המטיל הגדול (ילדים/נוער, בירידה) הוא מחכה שהם ינחתו.
const FLY_MS = 950;
const flies = (/** @type {boolean} */ decreasing) => decreasing && document.body.dataset.theme !== 'parent' && !reducedMotion();

// המספר "רץ" מהערך שמוצג עכשיו אל הערך החדש (אגורות, כך שגם הספרות הקטנות רצות).
function useCountUp(/** @type {number} */ target) {
  const [val, setVal] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (cur.current === target) return undefined;
    if (reducedMotion()) { cur.current = target; setVal(target); return undefined; }
    const from = cur.current;
    const diff = target - from;
    const dur = 1300;
    const t0 = performance.now() + (flies(target < from) ? FLY_MS : 350);
    let raf = 0;
    const step = (/** @type {number} */ now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      cur.current = p >= 1 ? target : from + diff * (1 - Math.pow(1 - p, 3));
      setVal(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

// כשהסכום משתנה נשמע צליל מטבעות ויש רטט, גם כשמתווסף חוב וגם כשהוא יורד. לא מצלצלים בעליית הנתונים הראשונה
// (סכום שנטען מ-0 תוך רגעים מפתיחת המסך). בירידה (תשלום), לפי העיצוב:
// ילדים/נוער - המטילים הקטנים שלהם (זהב/נחושת, כמו המטיל הגדול) עפים מלמטה אל המטיל הגדול, נכנסים לתוכו והוא קופץ קצת, ואז המספר רץ;
// הורים - רק המספר רץ. מצויר ב-portal כדי לא להיחתך ב-overflow של המטיל.
function useCoinBurst(/** @type {number} */ amount, /** @type {import('react').RefObject<HTMLElement | null>} */ ref) {
  const prev = useRef(amount);
  const mountedAt = useRef(Date.now());
  const [burst, setBurst] = useState(/** @type {null | { id: number, x: number, y: number, src: string, items: { x0: number, y0: number, sway: number, delay: number, w: number, h: number, dur: number, rot: number }[] }} */ (null));
  useEffect(() => {
    const was = prev.current;
    prev.current = amount;
    if (amount === was || !ref.current) return;
    if (amount > was) {
      // עלייה: צליל ורטט בלי אנימציית מטילים (המספר רץ למעלה), אבל לא בטעינה ראשונית של הנתונים
      if (!(was === 0 && Date.now() - mountedAt.current < 2500)) playCoinSound(Math.round(8 + Math.min(1, (amount - was) / Math.max(amount, 1)) * 8));
      return;
    }
    const share = was > 0 ? (was - amount) / was : 1;
    const n = Math.round(8 + share * 8);
    const fly = flies(true);
    if (!fly) { playCoinSound(n); return; }
    playCoinSound(n, 0.8, 0.8);
    const teen = document.body.dataset.theme === 'teen';
    const ratio = teen ? 640 / 393 : 570 / 313;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rnd = (/** @type {number} */ a, /** @type {number} */ b) => a + Math.random() * (b - a);
    const owe = !!el.closest('.sum')?.classList.contains('owe');
    const id = Date.now();
    const items = Array.from({ length: n }, () => {
      const h = rnd(20, 32);
      const sx = Math.min(innerWidth - 20, Math.max(20, cx + rnd(-150, 150)));
      return { x0: sx - cx, y0: innerHeight + 30 - cy, sway: rnd(-40, 40), delay: rnd(250, 700), w: h * ratio, h, dur: rnd(600, 850), rot: rnd(-40, 40) };
    });
    setBurst({ id, x: cx, y: cy, src: `bars/${teen ? 'teen-' + (document.body.dataset.palette || 'blue') : 'child'}-${owe ? 'owe' : 'get'}.webp`, items });
    setTimeout(() => setBurst((b) => (b && b.id === id ? null : b)), 2600);
    // כל כמה מטילים שנכנסים, המטיל הגדול קופץ קצת, כמו איסוף במשחק
    const box = el.closest('.sum');
    items.forEach((it, i) => {
      if (i % 3 !== 0 || !box) return;
      setTimeout(() => box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' }), it.delay + it.dur);
    });
  }, [amount, ref]);
  if (!burst) return null;
  return createPortal(
    <div className="coin-burst" aria-hidden="true" style={{ left: burst.x, top: burst.y }}>
      {burst.items.map((c, i) => (
        <img key={i} className="coin-burst__c" src={burst.src} alt="" draggable="false"
          style={/** @type {import('react').CSSProperties} */ ({ '--x0': c.x0 + 'px', '--y0': c.y0 + 'px', '--sway': c.sway + 'px', '--w': c.w + 'px', '--h': c.h + 'px', '--d': c.dur + 'ms', '--delay': c.delay + 'ms', '--rot': c.rot + 'deg' })} />
      ))}
    </div>,
    document.body,
  );
}

// סכום בתוך מטיל: הגופן קטן אוטומטית לפי אורך הטקסט כדי שלא יגלוש מהמטיל (ראו --len ב-CSS).
// עם amount (באגורות) ו-cur: כשהסכום משתנה המספר רץ אל הערך החדש, ובירידה (תשלום) מטבעות קטנים עולים מהמטיל.
export function SumNum({ children, amount, cur }) {
  const animated = typeof amount === 'number';
  const ref = useRef(null);
  const shown = useCountUp(animated ? amount : 0);
  const burst = useCoinBurst(animated ? amount : 0, ref);
  const final = animated ? money(amount, cur) : String(children ?? '');
  const text = animated ? money(Math.round(shown), cur) : final;
  // האורך נקבע לפי הסכום הסופי, כדי שהגופן לא יקפץ בזמן הריצה
  return (
    <>
      <div className="num" ref={ref} style={{ '--len': Math.max(final.length, 5) }}>{text}</div>
      {burst}
    </>
  );
}
