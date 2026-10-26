import { useId } from 'react';

// איור מטיל זהב אמיתי: חתך טרפזי סימטרי (שיפוע זהה בשני הצדדים), במבט אלכסוני מלמעלה עם וקטור עומק אחיד (20,-18):
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
        <linearGradient id={n('s')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--neon-a, #b04dff)', stopOpacity: 0 }} />
          <stop offset="0.3" style={{ stopColor: 'var(--neon-a, #b04dff)', stopOpacity: 0.75 }} />
          <stop offset="0.5" style={{ stopColor: '#fff', stopOpacity: 0.85 }} />
          <stop offset="0.7" style={{ stopColor: 'var(--neon-b, #22d8ff)', stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: 'var(--neon-b, #22d8ff)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={n('g')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--neon-a, #b04dff)', stopOpacity: 0.28 }} />
          <stop offset="0.5" style={{ stopColor: 'var(--neon-a, #b04dff)', stopOpacity: 0.04 }} />
          <stop offset="1" style={{ stopColor: 'var(--neon-b, #22d8ff)', stopOpacity: 0.34 }} />
        </linearGradient>
        <clipPath id={n('c')}>
          <polygon points="2,124 170,124 156,28 16,28" />
          <polygon points="16,28 156,28 176,10 36,10" />
          <polygon points="170,124 190,106 176,10 156,28" />
        </clipPath>
      </defs>
      {/* פאת קצה (ימין), הכהה ביותר */}
      <polygon points="170,124 190,106 176,10 156,28" fill={url('e')} />
      {/* פאה עליונה, הבהירה ביותר */}
      <polygon points="16,28 156,28 176,10 36,10" fill={url('t')} />
      {/* פאת חזית משופעת */}
      <polygon points="2,124 170,124 156,28 16,28" fill={url('f')} />
      {/* לוחית חרוטה על הפאה העליונה */}
      <polygon points="37.2,24 143.6,24 154.8,14 48.4,14" fill="rgba(0,0,0,.08)" stroke="rgba(255,255,255,.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <text className="gb-stamp" style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }} transform="matrix(1 0 -1.11 1.2 78 23)" fontSize="6" letterSpacing="1" fill="rgba(0,0,0,.5)">999.9</text>
      {/* קווי מסגרת: קצה עליון בוהק, מפגש חזית-קצה, בסיס כהה */}
      <g fill="none" vectorEffect="non-scaling-stroke">
        <polyline points="16,28 156,28" stroke="rgba(255,255,255,.9)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <polyline points="2,124 16,28" stroke="rgba(255,255,255,.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="170,124 156,28" stroke="rgba(255,255,255,.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="156,28 176,10" stroke="rgba(255,255,255,.6)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points="2,124 170,124" stroke="rgba(0,0,0,.4)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      {/* ברק שעובר על המטיל (נוער) */}
      <g clipPath={url('c')}>
        {/* בוהק ניאון קבוע ועדין על כל המטיל (נוער) */}
        <rect className="gb-glow" x="0" y="0" width="200" height="130" fill={url('g')} />
        <g className="gb-shine"><rect x="-86" y="0" width="50" height="140" transform="skewX(-22)" fill={url('s')} /></g>
      </g>
      {/* קו מתאר ניאון דק */}
      <g className="gb-rim" fill="none" vectorEffect="non-scaling-stroke">
        <polygon points="2,124 170,124 156,28 16,28" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polygon points="170,124 190,106 176,10 156,28" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polygon points="16,28 156,28 176,10 36,10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
