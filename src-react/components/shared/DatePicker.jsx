import Arrow from './Arrow.jsx';
import { useMemo, useState } from 'react';
import { t, intlLocale, langDir, currentLang } from '../../i18n/index.js';
import { useSheet } from './Sheet.jsx';
import Select from './Select.jsx';

// לוח שנה מעוצב משלנו (במקום <input type="date"> שנפתח בחלון הסטנדרטי של אנדרואיד/גוגל).
// הערך הוא מחרוזת ISO (YYYY-MM-DD), בדיוק כמו בשדה התאריך הרגיל.
const MIN_YEAR = 1900;
const MONDAY_FIRST = new Set(['de', 'fr', 'nl', 'it', 'es', 'el', 'ru', 'uk', 'sv', 'nb', 'da', 'pl', 'hu', 'cs', 'tr']);

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

export default function DatePicker({ value, onChange, max, title, fallbackYearsAgo = 0, id }) {
  const sheet = useSheet();
  const cur = parse(value);
  const label = cur ? new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'long' }).format(new Date(cur.y, cur.m, cur.d)) : '';
  const open = () => sheet.open(title || t('בחירת תאריך'),
    <Calendar value={value} max={max} fallbackYearsAgo={fallbackYearsAgo} onPick={(v) => { onChange(v); sheet.close(); }} />);
  return (
    <button type="button" id={id} className="dd-btn date-btn" aria-haspopup="dialog" onClick={open}>
      <span className="dd-val">{label || <span className="date-ph">{t('בחירת תאריך')}</span>}</span>
      <span aria-hidden="true">📅</span>
    </button>
  );
}

function Calendar({ value, max, fallbackYearsAgo, onPick }) {
  const lim = parse(max) || (() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; })();
  const sel = parse(value);
  const [view, setView] = useState(() => {
    if (sel) return { y: sel.y, m: sel.m };
    const y = Math.max(MIN_YEAR, lim.y - fallbackYearsAgo);
    return { y, m: y === lim.y ? lim.m : 0 };
  });
  const loc = intlLocale();
  const rtl = langDir() === 'rtl';
  const first = MONDAY_FIRST.has(currentLang()) ? 1 : 0;

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(loc, { month: 'long' }).format(new Date(2024, i, 1))), [loc]);
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const dow = (first + i) % 7; // 0 = ראשון (ה-7.1.2024 היה יום ראשון)
    return new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + dow));
  }), [loc, first]);
  const years = useMemo(() => {
    const out = [];
    for (let y = lim.y; y >= MIN_YEAR; y--) out.push({ value: y, label: String(y) });
    return out;
  }, [lim.y]);
  const monthOpts = useMemo(() => months
    .map((label, value) => ({ value, label }))
    .filter((o) => view.y < lim.y || o.value <= lim.m), [months, view.y, lim.y, lim.m]);

  const atMax = view.y === lim.y && view.m >= lim.m;
  const atMin = view.y === MIN_YEAR && view.m === 0;
  const step = (delta) => setView(({ y, m }) => {
    const n = y * 12 + m + delta;
    return { y: Math.floor(n / 12), m: n % 12 };
  });
  const setYear = (y) => setView((v) => ({ y, m: y === lim.y ? Math.min(v.m, lim.m) : v.m }));

  const lead = (new Date(view.y, view.m, 1).getDay() - first + 7) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  // תמיד 6 שורות (42 משבצות), כדי שגובה הלוח לא ישתנה בין חודשים.
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length < 42) cells.push(null);
  const num = new Intl.NumberFormat(loc, { useGrouping: false });

  // "הקודם" מצביע לכיוון שממנו קוראים (החץ מתהפך לבד לפי כיוון השפה).
  const prevArrow = <Arrow kind="chev-back" />;
  const nextArrow = <Arrow kind="chev-next" />;

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" aria-label={t('חודש קודם')} disabled={atMin} onClick={() => step(-1)}>{prevArrow}</button>
        <div className="cal-sel">
          <Select value={view.m} onChange={(m) => setView((v) => ({ ...v, m }))} options={monthOpts} />
          <Select value={view.y} onChange={setYear} options={years} />
        </div>
        <button type="button" className="cal-nav" aria-label={t('חודש הבא')} disabled={atMax} onClick={() => step(1)}>{nextArrow}</button>
      </div>
      <div className="cal-grid" role="grid">
        {weekdays.map((w, i) => <span key={i} className="cal-wd" aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={'e' + i} className="cal-pad" aria-hidden="true" />;
          const future = view.y === lim.y && view.m === lim.m && d > lim.d;
          const on = sel && sel.y === view.y && sel.m === view.m && sel.d === d;
          return (
            <button key={d} type="button" className={'cal-day' + (on ? ' on' : '')} disabled={future} aria-pressed={on}
              onClick={() => onPick(iso(view.y, view.m, d))}>{num.format(d)}</button>
          );
        })}
      </div>
    </div>
  );
}
