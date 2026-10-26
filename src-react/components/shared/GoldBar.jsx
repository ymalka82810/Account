import { useId } from 'react';

// איור מטיל זהב יצוק: פירמידה קטומה (הבסיס רחב מהחלק העליון בכל הכיוונים), מחושבת כגוף תלת-ממדי
// ומוטלת במבט אלכסוני מלמעלה. כך גם החזית וגם פאת הקצה משופעות באמת (פאת הקצה טרפז, לא מקבילית).
// הקצוות מעוגלים: קו המתאר החיצוני מעוגל, ובין הפאות יש פס אור רך במקום קו חד.
// הצבעים מ-CSS (--g-hi, --g-1 ... --g-3 ו---neon-*). מוצג רק בעיצובי הורה ונוער; בעיצוב ילדים מוסתר.
// נקודות (viewBox 202x124): בסיס FL(4,119.6) FR(174,119.6) BR(198.1,85.2);
// עליון TFL(28.2,20.7) TFR(162.2,20.7) TBR(173.9,4) TBL(39.9,4).
const OUTLINE = 'M5.7 112.8Q4.0 119.6 11.0 119.6L167.0 119.6Q174.0 119.6 178.0 113.9L194.1 90.9Q198.1 85.2 196.1 78.5L175.9 10.7Q173.9 4.0 166.9 4.0L46.9 4.0Q39.9 4.0 35.9 9.7L32.2 15.0Q28.2 20.7 26.5 27.5Z';
const FRONT = '4,119.6 174,119.6 162.2,20.7 28.2,20.7';
const TOP = '28.2,20.7 162.2,20.7 173.9,4 39.9,4';
const END = '174,119.6 198.1,85.2 173.9,4 162.2,20.7';

export function GoldBarArt() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = (s) => `gb${s}${id}`;
  const url = (s) => `url(#${n(s)})`;
  const stop = (offset, color, opacity) => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity ?? 1 }} />;
  return (
    <svg className="gb-art" viewBox="0 0 202 124" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={n('c')}><path d={OUTLINE} /></clipPath>
        <filter id={n('b')} x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.6" /></filter>
        <linearGradient id={n('f')} x1="0" y1="0" x2="0" y2="1">
          {stop(0, 'var(--g-1)')}{stop(0.55, 'var(--g-2)')}{stop(1, 'var(--g-3)')}
        </linearGradient>
        <radialGradient id={n('t')} cx="0.5" cy="0.5" r="0.7">
          {stop(0, 'var(--g-hi)')}{stop(1, 'var(--g-1)')}
        </radialGradient>
        <linearGradient id={n('e')} x1="0" y1="0" x2="1" y2="1">
          {stop(0, 'var(--g-3)')}{stop(1, 'color-mix(in srgb, var(--g-3) 45%, #000)')}
        </linearGradient>
        <linearGradient id={n('s')} x1="0" y1="0" x2="1" y2="0">
          {stop(0, 'var(--neon-a, #b04dff)', 0)}{stop(0.3, 'var(--neon-a, #b04dff)', 0.75)}{stop(0.5, '#fff', 0.85)}
          {stop(0.7, 'var(--neon-b, #22d8ff)', 0.75)}{stop(1, 'var(--neon-b, #22d8ff)', 0)}
        </linearGradient>
        <linearGradient id={n('g')} x1="0" y1="0" x2="1" y2="1">
          {stop(0, 'var(--neon-a, #b04dff)', 0.28)}{stop(0.5, 'var(--neon-a, #b04dff)', 0.04)}{stop(1, 'var(--neon-b, #22d8ff)', 0.34)}
        </linearGradient>
      </defs>
      <g clipPath={url('c')}>
        <polygon points={END} fill={url('e')} />
        <polygon points={TOP} fill={url('t')} />
        <polygon points={FRONT} fill={url('f')} />
        {/* לוחית חרוטה על הפאה העליונה */}
        <polygon points="70.1,18 124.1,18 132,6.7 78,6.7" fill="rgba(0,0,0,.07)" stroke="rgba(255,255,255,.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text className="gb-stamp" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }} textAnchor="middle" transform="matrix(1 0 -0.66 0.94 103 15.6)" fontSize="7.5" fontWeight="700" letterSpacing="1.2" fill="rgba(0,0,0,.55)">999.9</text>
        {/* קצוות מעוגלים: פסי אור רכים לאורך המפגשים בין הפאות */}
        <g filter={url('b')} strokeLinecap="round" fill="none">
          <line x1="28.2" y1="20.7" x2="162.2" y2="20.7" style={{ stroke: 'var(--g-hi)' }} strokeWidth="5" opacity=".9" />
          <line x1="162.2" y1="20.7" x2="173.9" y2="4" style={{ stroke: 'var(--g-hi)' }} strokeWidth="4" opacity=".55" />
          <line x1="28.2" y1="20.7" x2="39.9" y2="4" style={{ stroke: 'var(--g-hi)' }} strokeWidth="4" opacity=".6" />
          <line x1="39.9" y1="4" x2="173.9" y2="4" style={{ stroke: 'var(--g-hi)' }} strokeWidth="3" opacity=".5" />
          <line x1="162.2" y1="20.7" x2="174" y2="119.6" style={{ stroke: 'var(--g-3)' }} strokeWidth="5" opacity=".8" />
          <line x1="28.2" y1="20.7" x2="4" y2="119.6" style={{ stroke: 'var(--g-hi)' }} strokeWidth="4" opacity=".35" />
          <line x1="4" y1="119.6" x2="174" y2="119.6" stroke="#000" strokeWidth="4" opacity=".35" />
        </g>
        {/* נוער: בוהק ניאון קבוע ועדין, וברק שעובר על המטיל */}
        <rect className="gb-glow" x="0" y="0" width="202" height="124" fill={url('g')} />
        <g className="gb-shine"><rect x="-86" y="0" width="50" height="140" transform="skewX(-22)" fill={url('s')} /></g>
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
