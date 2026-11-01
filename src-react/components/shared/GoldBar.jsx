import { useId } from 'react';

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

// סכום בתוך מטיל: הגופן קטן אוטומטית לפי אורך הטקסט כדי שלא יגלוש מהמטיל (ראו --len ב-CSS)
export function SumNum({ children }) {
  const text = String(children ?? '');
  return <div className="num" style={{ '--len': Math.max(text.length, 5) }}>{text}</div>;
}
