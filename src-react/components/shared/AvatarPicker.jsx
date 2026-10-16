import { AVATARS } from '../../state/state.js';
import { useSheet } from './Sheet.jsx';

export const randomAvatar = (options = AVATARS) => options[Math.floor(Math.random() * options.length)];

// compact=true: מציג 4 שורות, כל אחת נגללת לצדדים בפני עצמה ומכילה עד 20 דמויות,
// ומתחתיהן כפתור "עוד" שפותח את הרשימה המלאה באריח (sheet) נפרד; הבחירה שם נסגרת
// וחוזרת ל-onChange הרגיל, בלי לשמור כלום בשרת (מתאים לטופס יצירה, לא רק לעריכת דמות קיימת).
const ROWS = 4;
const MAX_PER_ROW = 20;

export default function AvatarPicker({ value, onChange, options = AVATARS, taken, compact }) {
  const sheet = useSheet();
  const shown = taken ? options.filter((a) => a === value || !taken.has(a)) : options;

  function openFull() {
    sheet.open('דמות', (
      <div className="form">
        <AvatarPicker value={value} onChange={(a) => { onChange(a); sheet.close(); }} options={options} taken={taken} />
      </div>
    ));
  }

  const btn = (a) => (
    <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
      aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
  );

  if (!compact) return <div className="avatars">{shown.map(btn)}</div>;

  // הדמות הנבחרת תמיד ראשונה כדי שתהיה גלויה, ואז מחלקים ל-4 שורות שוות (עד 20 בכל אחת)
  const list = value && shown.includes(value) ? [value, ...shown.filter((a) => a !== value)] : shown;
  const perRow = Math.min(MAX_PER_ROW, Math.ceil(list.length / ROWS));
  const rows = Array.from({ length: ROWS }, (_, i) => list.slice(i * perRow, (i + 1) * perRow)).filter((r) => r.length);

  return (
    <div className="avatars-compact">
      {rows.map((r, i) => <div key={i} className="avatars-row">{r.map(btn)}</div>)}
      <button type="button" className="ghost av-more" aria-label="עוד דמויות" onClick={openFull}>עוד דמויות</button>
    </div>
  );
}
