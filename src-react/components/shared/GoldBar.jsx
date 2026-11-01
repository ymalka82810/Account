import { useId } from 'react';

// מטיל הזהב עצמו (המתכת, הפאות והחותמת 999.9) הוא תמונה שרונדרה ב-Blender (public/bars/<theme>-<get|owe>.webp,
// ראו scripts/blender/bar.py), ונקבעת ב-CSS לפי תפקיד וסוג (.sum::before). הגיאומטריה של התמונה זהה לקו המתאר
// כאן (viewBox 202x124), כך שהטקסט ממשיך לשבת על החזית.
// ה-SVG הזה נשאר רק לשכבות הנוער מעל התמונה: בוהק ניאון קבוע, ברק שעובר על המטיל וקו מתאר דק (מוצגים רק בעיצוב נוער).
// המשטחים של המטיל (קירוב לגיאומטריה של התמונה): חזית, משטח עליון ושני צדדים משופעים. הברק נשבר על כל משטח בנפרד.
const FACES = {
  // המשטחים חופפים בכ-1.2 יחידות בקצוות, כדי שלא יישאר קו רווח דק בתפר (חיתוך מרוכך משאיר "נקודות" כהות)
  front: 'M28.8 19.3L163.7 19.3L173.2 117.4L6.8 117.4Z',
  top: 'M35 0L170 0L163.7 21.7L28.8 21.7Z',
  right: 'M168.8 0L202 0L202 124L170.8 117.4L161.3 20.5Z',
  left: 'M36 0L31.2 20.5L9.2 117.4L0 124L0 0Z',
};
// חזית ומשטח עליון חולקים אותה זווית ורוחב, כך שהפס רציף ביניהם; הצדדים המשופעים חדים וצרים יותר, ושם הפס נשבר
const SHINE = { front: { skew: -22, w: 50, o: 1 }, top: { skew: -22, w: 50, o: 1 }, right: { skew: -52, w: 30, o: 1 }, left: { skew: -52, w: 30, o: 1 } };

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
        {Object.entries(FACES).map(([k, d]) => <clipPath key={k} id={n(k)}><path d={d} /></clipPath>)}
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
        {Object.keys(FACES).map((k) => (
          <g key={k} clipPath={url(k)}>
            <g className="gb-shine" style={{ opacity: SHINE[k].o }}>
              <rect x={-60 - SHINE[k].w} y="0" width={SHINE[k].w} height="140" transform={`skewX(${SHINE[k].skew})`} fill={url('s')} />
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
