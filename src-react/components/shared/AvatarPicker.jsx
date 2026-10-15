import { AVATARS } from '../../state/state.js';
import { useSheet } from './Sheet.jsx';

export const randomAvatar = (options = AVATARS) => options[Math.floor(Math.random() * options.length)];

// compact=true: מציג רק 4 שורות עם גלילה לצדדים, ומוסיף כפתור "עוד" שפותח
// את הרשימה המלאה באריח (sheet) נפרד; הבחירה שם נסגרת וחוזרת ל-onChange הרגיל,
// בלי לשמור כלום בשרת (מתאים לטופס יצירה, לא רק לעריכת דמות קיימת).
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

  return (
    <div className={compact ? 'avatars avatars-compact' : 'avatars'}>
      {shown.map((a) => (
        <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
          aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
      ))}
      {compact && (
        <button type="button" className="av av-more" aria-label="עוד דמויות" onClick={openFull}>עוד</button>
      )}
    </div>
  );
}
