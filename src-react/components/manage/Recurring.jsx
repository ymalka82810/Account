import { call } from '../../lib/api.js';
import { useState } from 'react';
import { toast, errMsg } from '../../lib/helpers.js';
import { WEEKDAYS } from '../../state/state.js';
import { money, fmtDate, namesFor, baseCurrency } from '../../lib/computations.js';
import { currencySymbol } from '../../lib/currencies.js';
import { g } from '../../lib/gender.js';
import Select from '../shared/Select.jsx';

const recurringWhen = (r) => (r.frequency === 'weekly' ? `כל יום ${WEEKDAYS[r.weekday]}` : `ב-${r.monthDay} בכל חודש`);

// דמי כיס קבועים (הורים בלבד).
export default function Recurring({ data, token }) {
  const me = data.me.id;
  const people = data.people;
  const { nameOf, genderOf } = namesFor(me, (id) => people.find((p) => p.id === id));

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

  const personOptions = people.map((p) => ({ value: p.id, label: (p.avatar ? `${p.avatar} ` : '') + p.name }));

  return (
    <>
      <div id="recurringList">
        {data.recurring.length === 0 && <div className="empty">עוד אין רישומים קבועים.</div>}
        {data.recurring.map((r) => (
          <div className="row" key={r.id}>
            <div className="text">
              <div>{nameOf(r.from)} {g(genderOf(r.from), 'חייב', 'חייבת', 'חייב/ת')} ל{nameOf(r.to)} {money(r.amount, r.currency)}</div>
              <div className="meta">{[recurringWhen(r), r.note, 'הרישום הבא: ' + fmtDate(r.nextDate)].filter(Boolean).join(' • ')}</div>
            </div>
            <button className="small danger" type="button" onClick={() => remove(r)}>הפסקה</button>
          </div>
        ))}
      </div>
      <form className="form card" autoComplete="off" onSubmit={submit}>
        <h3>רישום קבוע חדש</h3>
        <div className="field"><span>מי חייב/ת (משלם/ת)</span>
          <Select value={fromVal} onChange={setFrom} options={personOptions} /></div>
        <div className="field"><span>למי</span>
          <Select value={toVal} onChange={setTo} options={personOptions} /></div>
        <label className="field"><span>סכום ({currencySymbol(baseCurrency())})</span>
          <input type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required
            value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span>הערה</span>
          <input type="text" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="field"><span>כל כמה זמן</span>
          <Select value={freq} onChange={setFreq} options={[
            { value: 'weekly', label: 'כל שבוע' },
            { value: 'monthly', label: 'כל חודש' },
          ]} /></div>
        {freq === 'weekly' ? (
          <div className="field"><span>באיזה יום</span>
            <Select value={weekday} onChange={setWeekday}
              options={WEEKDAYS.map((d, i) => ({ value: String(i), label: 'יום ' + d }))} /></div>
        ) : (
          <div className="field"><span>באיזה יום בחודש (1 עד 28)</span>
            <Select value={monthDay} onChange={setMonthDay}
              options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} /></div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit">הוספה</button>
      </form>
    </>
  );
}
