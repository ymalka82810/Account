import { call } from '../../lib/api.js';
import { useState } from 'react';
import { toast, errMsg } from '../../lib/helpers.js';
import { WEEKDAYS } from '../../state/state.js';
import { money, fmtDate } from '../../lib/computations.js';

const recurringWhen = (r) => (r.frequency === 'weekly' ? `כל יום ${WEEKDAYS[r.weekday]}` : `ב-${r.monthDay} בכל חודש`);

// דמי כיס קבועים (הורים בלבד).
export default function Recurring({ data, token }) {
  const me = data.me.id;
  const people = data.people;
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'לא ידוע';

  const defaultTo = (people.find((p) => p.role === 'child') || people.find((p) => p.id !== me) || data.me).id;
  const [from, setFrom] = useState(me);
  const [to, setTo] = useState(defaultTo);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('דמי כיס');
  const [freq, setFreq] = useState('weekly');
  const [weekday, setWeekday] = useState('5');
  const [monthDay, setMonthDay] = useState('1');
  const [error, setError] = useState('');

  // אם הבחירה כבר לא קיימת ברשימה (מישהו נמחק) חוזרים לברירת המחדל.
  const exists = (id) => people.some((p) => p.id === id);
  const fromVal = exists(from) ? from : me;
  const toVal = exists(to) ? to : defaultTo;

  async function remove(r) {
    if (!confirm('להפסיק את הרישום הקבוע? מה שכבר נרשם נשאר.')) return;
    try { await call('recurring:remove', { token, id: r.id }); toast('הרישום הקבוע הופסק'); }
    catch (err) { toast(errMsg(err)); }
  }

  async function submit(ev) {
    ev.preventDefault();
    setError('');
    const agorot = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(agorot) || agorot <= 0) { setError('כתבו סכום גדול מאפס.'); return; }
    try {
      await call('recurring:add', {
        token, from: fromVal, to: toVal, amount: agorot, note,
        frequency: freq,
        weekday: freq === 'weekly' ? Number(weekday) : undefined,
        monthDay: freq === 'monthly' ? Number(monthDay) : undefined,
      });
      setAmount('');
      toast('הרישום הקבוע נוסף ✅');
    } catch (e) { setError(errMsg(e)); }
  }

  const options = people.map((p) => <option key={p.id} value={p.id}>{p.avatar ? `${p.avatar} ` : ''}{p.name}</option>);

  return (
    <>
      <div id="recurringList">
        {data.recurring.length === 0 && <div className="empty">עוד אין רישומים קבועים.</div>}
        {data.recurring.map((r) => (
          <div className="row" key={r.id}>
            <div className="text">
              <div>{nameOf(r.from)} חייב/ת ל{nameOf(r.to)} {money(r.amount)}</div>
              <div className="meta">{[recurringWhen(r), r.note, 'הרישום הבא: ' + fmtDate(r.nextDate)].filter(Boolean).join(' • ')}</div>
            </div>
            <button className="small danger" type="button" onClick={() => remove(r)}>הפסקה</button>
          </div>
        ))}
      </div>
      <form className="form card" autoComplete="off" onSubmit={submit}>
        <h3>רישום קבוע חדש</h3>
        <label className="field"><span>מי חייב/ת (משלם/ת)</span>
          <select value={fromVal} onChange={(e) => setFrom(e.target.value)}>{options}</select></label>
        <label className="field"><span>למי</span>
          <select value={toVal} onChange={(e) => setTo(e.target.value)}>{options}</select></label>
        <label className="field"><span>סכום (₪)</span>
          <input type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required
            value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span>הערה</span>
          <input type="text" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="field"><span>כל כמה זמן</span>
          <select value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="weekly">כל שבוע</option><option value="monthly">כל חודש</option>
          </select></label>
        {freq === 'weekly' ? (
          <label className="field"><span>באיזה יום</span>
            <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              {WEEKDAYS.map((d, i) => <option key={i} value={String(i)}>יום {d}</option>)}
            </select></label>
        ) : (
          <label className="field"><span>באיזה יום בחודש (1 עד 28)</span>
            <select value={monthDay} onChange={(e) => setMonthDay(e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
            </select></label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit">הוספה</button>
      </form>
    </>
  );
}
