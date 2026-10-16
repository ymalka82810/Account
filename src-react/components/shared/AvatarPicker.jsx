import { useEffect, useRef } from 'react';
import { AVATARS } from '../../state/state.js';
import { useSheet } from './Sheet.jsx';

export const randomAvatar = (options = AVATARS) => options[Math.floor(Math.random() * options.length)];

// compact=true: מציג 4 שורות, כל אחת נגללת לצדדים בפני עצמה ומכילה עד 20 דמויות (בסדר קבוע),
// ומתחתיהן כפתור "עוד" שפותח את הרשימה המלאה באריח (sheet) נפרד; הבחירה שם נסגרת
// וחוזרת ל-onChange הרגיל, בלי לשמור כלום בשרת (מתאים לטופס יצירה, לא רק לעריכת דמות קיימת).
const ROWS = 4;
const MAX_PER_ROW = 20;

export default function AvatarPicker({ value, onChange, options = AVATARS, taken, compact }) {
  const sheet = useSheet();
  const box = useRef(null);
  const shown = taken ? options.filter((a) => a === value || !taken.has(a)) : options;

  function openFull() {
    sheet.open('דמות', (
      <div className="form">
        <AvatarPicker value={value} onChange={(a) => { onChange(a); sheet.close(); }} options={options} taken={taken} />
      </div>
    ));
  }

  // בטעינה בלבד: אם הדמות הנבחרת מחוץ לשדה הראייה של השורה שלה, מגללים אליה פעם אחת.
  // בלחיצות אחר כך שום דבר לא זז - הדמות הנבחרת רק מתגדלת במקומה.
  useEffect(() => {
    const el = box.current && box.current.querySelector('.av.on');
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  const btn = (a) => (
    <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
      aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
  );

  if (!compact) return <div className="avatars">{shown.map(btn)}</div>;

  // הסדר קבוע לגמרי: הדמויות לא זזות ולא מתחלפות בין שורות בעת בחירה.
  // רק אם הדמות הנבחרת לא נכנסת ב-4 השורות (למשל הגרלה ראשונית), היא תופסת את המקום האחרון.
  const perRow = Math.min(MAX_PER_ROW, Math.ceil(shown.length / ROWS));
  let list = shown.slice(0, ROWS * perRow);
  if (value && shown.includes(value) && !list.includes(value)) list = [...list.slice(0, -1), value];
  const rows = Array.from({ length: ROWS }, (_, i) => list.slice(i * perRow, (i + 1) * perRow)).filter((r) => r.length);

  return (
    <div className="avatars-compact" ref={box}>
      {rows.map((r, i) => <div key={i} className="avatars-row">{r.map(btn)}</div>)}
      <button type="button" className="ghost av-more" aria-label="עוד דמויות" onClick={openFull}>עוד דמויות</button>
    </div>
  );
}
