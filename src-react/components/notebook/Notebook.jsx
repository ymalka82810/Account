import { useState } from 'react';
import { state } from '../../state/state.js';
import { goView } from '../../state/auth.js';
import { today, toast } from '../../lib/helpers.js';
import { money, fmtDate } from '../../lib/computations.js';
import {
  useNotebook, notebookCurrency, addEntry, setPaid, removeEntry, setBirthDate, ageOf, isAdult, parseBirth,
} from '../../lib/notebook.js';
import { In } from '../auth/parts.jsx';

// פנקס חובות אישי: כל אחד (גם ילד/ה) רושם לעצמו למי הוא חייב ומי חייב לו.
// הכול נשמר במכשיר, בלי כניסה. ממנו אפשר לעבור להקמת קופה משפחתית (רק מעל גיל 18).
export default function Notebook({ current }) {
  const nb = useNotebook();
  const cur = notebookCurrency();
  const [dir, setDir] = useState('iowe');
  const [form, setForm] = useState({ name: '', amount: '', note: '' });
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(false);
  const [birth, setBirth] = useState(nb.birthDate || '');
  const [birthErr, setBirthErr] = useState('');
  const [tooYoung, setTooYoung] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const open = nb.entries.filter((e) => !e.paid);
  const done = nb.entries.filter((e) => e.paid);
  const sum = (d) => open.filter((e) => e.dir === d).reduce((s, e) => s + e.amount, 0);

  const submit = (ev) => {
    ev.preventDefault();
    const name = form.name.trim();
    const amount = Math.round(parseFloat(String(form.amount).replace(',', '.')) * 100);
    if (!name) { setError('כתבו את השם'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('כתבו סכום'); return; }
    if (amount > 1e9) { setError('הסכום גדול מדי'); return; }
    addEntry({ dir, name: name.slice(0, 30), amount, note: form.note.trim().slice(0, 60), date: today() });
    setForm({ name: '', amount: '', note: '' });
  };

  const del = (e) => { if (window.confirm(`למחוק את הרישום של ${e.name}?`)) removeEntry(e.id); };

  const startUpgrade = () => {
    setBirthErr('');
    if (nb.birthDate) return decide(nb.birthDate);
    setUpgrade(true);
  };
  const decide = (iso) => {
    if (isAdult(iso)) { setUpgrade(false); setTooYoung(false); goView('setup'); return; }
    setUpgrade(true);
    setTooYoung(true);
  };
  const saveBirth = (ev) => {
    ev.preventDefault();
    if (!parseBirth(birth)) { setBirthErr('תאריך לידה לא תקין'); return; }
    setBirthDate(birth);
    setBirthErr('');
    decide(birth);
  };

  const row = (e) => (
    <div className={'row' + (e.paid ? ' paid' : '')} key={e.id}>
      <div className="text">
        <strong>{e.name}</strong>
        <div className="meta">{e.dir === 'iowe' ? 'אני חייב' : 'חייב/ת לי'}{e.note ? ' • ' + e.note : ''} • {fmtDate(e.date)}</div>
      </div>
      <strong>{money(e.amount, cur)}</strong>
      <div className="acts">
        <button className="small" type="button" onClick={() => setPaid(e.id, !e.paid)}>{e.paid ? '↩️ עוד לא' : '✅ שולם'}</button>
        <button className="small" type="button" aria-label="מחיקה" onClick={() => del(e)}>🗑️</button>
      </div>
    </div>
  );

  return (
    <In screen="notebook" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}>→ חזרה</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">📒</div>
        <h1>הפנקס שלי</h1>
        <p className="hint">רושמים למי חייבים ומי חייב לנו. הכול נשמר רק במכשיר הזה, בלי כניסה ובלי סיסמה.</p>

        <div className="card">
          <p>אני חייב: <strong>{money(sum('iowe'), cur)}</strong></p>
          <p>חייבים לי: <strong>{money(sum('owed'), cur)}</strong></p>
        </div>

        <form className="form" autoComplete="off" onSubmit={submit}>
          <div className="tiles">
            <button type="button" className={'ghost' + (dir === 'iowe' ? ' active' : '')} onClick={() => setDir('iowe')}>אני חייב</button>
            <button type="button" className={'ghost' + (dir === 'owed' ? ' active' : '')} onClick={() => setDir('owed')}>חייבים לי</button>
          </div>
          <label className="field"><span>{dir === 'iowe' ? 'למי?' : 'מי חייב לי?'}</span>
            <input type="text" maxLength={30} value={form.name} onChange={set('name')} /></label>
          <label className="field"><span>כמה?</span>
            <input type="text" inputMode="decimal" dir="ltr" placeholder="0" value={form.amount} onChange={set('amount')} /></label>
          <label className="field"><span>על מה? (אפשר לדלג)</span>
            <input type="text" maxLength={60} value={form.note} onChange={set('note')} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit">➕ רישום</button>
        </form>

        {open.length > 0 && <div className="list">{open.map(row)}</div>}
        {open.length === 0 && done.length === 0 && <p className="hint">עוד אין כלום ברשימה.</p>}
        {done.length > 0 && (
          <details>
            <summary>שולמו ({done.length})</summary>
            <div className="list">{done.map(row)}</div>
          </details>
        )}

        <div className="card notice">
          <p><strong>👨‍👩‍👧 רוצים לנהל את זה עם המשפחה?</strong></p>
          <p className="hint">הורה פותח קופה משפחתית, ובני המשפחה מצטרפים אליה עם קוד.</p>
          {!upgrade && <button className="ghost" type="button" onClick={startUpgrade}>הקמת קופה משפחתית</button>}
          {upgrade && !tooYoung && (
            <form className="form" onSubmit={saveBirth}>
              <label className="field"><span>תאריך לידה (קופה נפתחת רק על ידי מי שמעל גיל {18})</span>
                <input type="date" required max={today()} value={birth} onChange={(e) => { setBirth(e.target.value); setBirthErr(''); }} /></label>
              {birthErr && <p className="error" role="alert">{birthErr}</p>}
              <button className="primary" type="submit">המשך</button>
              <button className="ghost" type="button" onClick={() => setUpgrade(false)}>לא עכשיו</button>
            </form>
          )}
          {upgrade && tooYoung && (
            <div>
              <p>קופה משפחתית נפתחת רק על ידי הורה מעל גיל 18. אם ההורים שלך כבר פתחו קופה, בקשו מהם את קוד ההצטרפות וכתבו אותו במסך הראשון.</p>
              <button className="primary" type="button" onClick={() => goView('welcome')}>למסך הכניסה עם קוד</button>
              <button className="ghost" type="button" onClick={() => { setTooYoung(false); setUpgrade(true); }}>הזנתי תאריך לא נכון</button>
            </div>
          )}
        </div>
      </div>
    </In>
  );
}
