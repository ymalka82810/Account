import { useEffect, useRef, useState } from 'react';
import { AVATARS } from '../../state/state.js';
import { useSheet } from './Sheet.jsx';

export const randomAvatar = (options = AVATARS) => options[Math.floor(Math.random() * options.length)];

// compact=true: מציג 4 שורות, כל אחת נגללת לצדדים בפני עצמה ומכילה עד 20 דמויות (בסדר קבוע),
// ומתחתיהן כפתור "עוד" שפותח את הרשימה המלאה באריח (sheet) נפרד; הבחירה שם נסגרת
// וחוזרת ל-onChange הרגיל, בלי לשמור כלום בשרת (מתאים לטופס יצירה, לא רק לעריכת דמות קיימת).
const ROWS = 4;
const MAX_PER_ROW = 20;

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// שורה נגללת בלי פס גלילה: משני הצדדים הצללה, ועליה חץ לכיוון שאפשר להמשיך לגלול אליו.
// החצים פיזיים (שמאל/ימין) ולא לוגיים, והחישוב מתאים גם ל-RTL (שם scrollLeft שלילי).
function ScrollRow({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const fromLeft = rtl ? max + el.scrollLeft : el.scrollLeft;
      const next = { left: fromLeft > 2, right: fromLeft < max - 2 };
      setEdge((p) => (p.left === next.left && p.right === next.right ? p : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [children]);

  const go = (sign) => ref.current && ref.current.scrollBy({ left: sign * ref.current.clientWidth * 0.7, behavior: 'smooth' });

  return (
    <div className="avatars-row-wrap">
      <div className="avatars-row" ref={ref}>{children}</div>
      <div className={'row-edge left' + (edge.left ? ' show' : '')} aria-hidden={!edge.left}>
        <button type="button" tabIndex={edge.left ? 0 : -1} aria-label="גלול שמאלה" onClick={() => go(-1)}><Chevron dir="left" /></button>
      </div>
      <div className={'row-edge right' + (edge.right ? ' show' : '')} aria-hidden={!edge.right}>
        <button type="button" tabIndex={edge.right ? 0 : -1} aria-label="גלול ימינה" onClick={() => go(1)}><Chevron dir="right" /></button>
      </div>
    </div>
  );
}

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
      {rows.map((r, i) => <ScrollRow key={i}>{r.map(btn)}</ScrollRow>)}
      <button type="button" className="ghost av-more" aria-label="עוד דמויות" onClick={openFull}>עוד דמויות</button>
    </div>
  );
}
