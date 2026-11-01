// חצים בעיצוב שלנו (SVG) במקום תווי חץ של המערכת: הצבע בא מערכת הנושא (ראו .arrow ב-style.css),
// והכיוון לוגי (התחלה/סוף) ולכן מתהפך לבד בין עברית/ערבית לשאר השפות.
const PATHS = {
  arrow: 'M4 12h15M13 6l6 6-6 6',            // חץ עם קו
  chev: 'M9 6l6 6-6 6',                       // סוגריים זוויתיים
  down: 'M6 9l6 6 6-6',                       // פתיחת תפריט
  ret: 'M9 14L4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3', // חזרה (פנייה לאחור)
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
};

// kind: back/next = חץ עם קו להתחלה/לסוף כיוון הקריאה | left/right = פיזי
//       chev-back/chev-next = זוויתי | down | return | download
const KINDS = {
  back: ['arrow', 'arrow-start'], next: ['arrow', 'arrow-end'], left: ['arrow', 'arrow-left'], right: ['arrow', ''],
  'chev-back': ['chev', 'arrow-start'], 'chev-next': ['chev', 'arrow-end'],
  down: ['down', ''], return: ['ret', ''], download: ['download', ''],
};

export default function Arrow({ kind = 'back', className = '' }) {
  const [shape, dir] = KINDS[kind] || KINDS.back;
  return (
    <svg className={('arrow ' + dir + ' ' + className).trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[shape]} />
    </svg>
  );
}

// טקסט שמכיל ← או → (למשל "עכשיו ← אחרי", גם בתרגומים): מציג במקומם חץ שלנו
export function withArrows(text) {
  if (typeof text !== 'string' || !/[←→]/.test(text)) return text;
  return text.split(/\s*[←→]\s*/).flatMap((part, i) => (i ? [' ', <Arrow key={i} kind="next" />, ' ', part] : [part]));
}
