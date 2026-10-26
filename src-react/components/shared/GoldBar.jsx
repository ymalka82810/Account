import { useId } from 'react';

// איור מטיל זהב אמיתי: חתך טרפזי (העליונה קטנה מהבסיס), במבט אלכסוני מלמעלה:
// פאת חזית משופעת, פאה עליונה ופאת קצה משופעת. הצבעים לוקחים מ-CSS (--g-1 ... --g-3 ו---neon-*).
// מוצג רק בעיצובי הורה ונוער (ב-CSS); בעיצוב ילדים הוא מוסתר.
export function GoldBarArt() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = (s) => `gb${s}${id}`;
  const url = (s) => `url(#${n(s)})`;
  const stop = (offset, color) => <stop offset={offset} style={{ stopColor: color }} />;
  return (
    <svg className="gb-art" viewBox="0 6 200 122" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={n('f')} x1="0" y1="0" x2="0" y2="1">
          {stop(0, 'var(--g-1)')}{stop(0.55, 'var(--g-2)')}{stop(1, 'var(--g-3)')}
        </linearGradient>
        <linearGradient id={n('t')} x1="0" y1="1" x2="0" y2="0">
          {stop(0, 'var(--g-1)')}{stop(1, 'var(--g-hi)')}
        </linearGradient>
        <linearGradient id={n('e')} x1="0" y1="0" x2="0" y2="1">
          {stop(0, 'var(--g-3)')}{stop(1, 'color-mix(in srgb, var(--g-3) 50%, #000)')}
        </linearGradient>
        <linearGradient id={n('n')} x1="0" y1="0" x2="1" y2="0">
          {stop(0, 'var(--neon-a, #b04dff)')}{stop(1, 'var(--neon-b, #22d8ff)')}
        </linearGradient>
        <linearGradient id={n('s')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={n('c')}>
          <polygon points="2,124 170,124 162,28 22,28" />
          <polygon points="22,28 162,28 182,10 42,10" />
          <polygon points="170,124 198,100 182,10 162,28" />
        </clipPath>
      </defs>
      {/* פאת קצה (ימין), הכהה ביותר */}
      <polygon points="170,124 198,100 182,10 162,28" fill={url('e')} />
      {/* פאה עליונה, הבהירה ביותר */}
      <polygon points="22,28 162,28 182,10 42,10" fill={url('t')} />
      {/* פאת חזית משופעת */}
      <polygon points="2,124 170,124 162,28 22,28" fill={url('f')} />
      {/* לוחית חרוטה על הפאה העליונה */}
      <polygon points="47.4,24 145.4,24 156.6,14 58.6,14" fill="rgba(0,0,0,.08)" stroke="rgba(255,255,255,.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <text className="gb-stamp" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }} transform="matrix(1 0 -1.33 1.2 83 23)" fontSize="6" letterSpacing="1" fill="rgba(0,0,0,.5)">999.9</text>
      {/* פס ניאון בתחתית החזית (נוער) */}
      <polygon className="gb-neon" points="2,124 170,124 169.4,117 3.2,117" fill={url('n')} />
      {/* קווי מסגרת: קצה עליון בוהק, מפגש חזית-קצה, בסיס כהה */}
      <g fill="none" vectorEffect="non-scaling-stroke">
        <polyline points="22,28 162,28" stroke="rgba(255,255,255,.9)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <polyline points="2,124 22,28" stroke="rgba(255,255,255,.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="170,124 162,28" stroke="rgba(255,255,255,.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="162,28 182,10" stroke="rgba(255,255,255,.6)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="2,124 170,124" stroke="rgba(0,0,0,.4)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      {/* ברק שעובר על המטיל (נוער) */}
      <g clipPath={url('c')}>
        <g className="gb-shine"><rect x="-70" y="0" width="34" height="140" transform="skewX(-22)" fill={url('s')} /></g>
      </g>
    </svg>
  );
}
