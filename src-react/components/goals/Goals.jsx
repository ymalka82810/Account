import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { money } from '../../lib/computations.js';
import { currencySymbol } from '../../lib/currencies.js';
import AsyncButton from '../shared/AsyncButton.jsx';
import Select from '../shared/Select.jsx';

const toMinor = (s) => Math.round(parseFloat(s) * 100);

// יעדי חיסכון עם פס התקדמות. ילד/ה ונער/ה רואים את שלהם ומבקשים להפקיד (ממתין לאישור הורה).
// הורה רואה את כל המשפחה, מפקיד ישירות, מאשר הפקדות ופותח יעד לכל ילד/ה.
export default function Goals({ data, token }) {
  const isParent = data.me.role === 'parent';
  const kids = data.people.filter((p) => p.role !== 'parent');
  const [owner, setOwner] = useState(isParent ? kids[0]?.id : data.me.id);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [dep, setDep] = useState({}); // goalId -> טקסט הסכום
  const [error, setError] = useState('');
  const who = (id) => data.people.find((p) => p.id === id);
  if (isParent && kids.length === 0) return null;

  async function addGoal(ev) {
    ev.preventDefault();
    setError('');
    const minor = toMinor(target);
    if (!Number.isFinite(minor) || minor <= 0) { setError(t('כתבו סכום גדול מאפס.')); return; }
    try {
      await call('goals:add', { token, personId: isParent ? owner : undefined, name, target: minor });
      setName(''); setTarget('');
      toast(t('היעד נוסף 🎯'));
    } catch (e) { setError(errMsg(e)); }
  }

  async function deposit(goal) {
    const minor = toMinor(dep[goal.id]);
    if (!Number.isFinite(minor) || minor <= 0) { toast(t('כתבו סכום גדול מאפס.')); return; }
    try {
      await call('goals:deposit', { token, goalId: goal.id, amount: minor });
      setDep((d) => ({ ...d, [goal.id]: '' }));
      toast(isParent ? t('ההפקדה נוספה 🐷') : t('הבקשה נשלחה להורה'));
    } catch (e) { toast(errMsg(e)); }
  }

  const decide = (id, approve) => async () => {
    try { await call('goals:decide', { token, depositId: id, approve }); } catch (e) { toast(errMsg(e)); }
  };

  async function remove(goal) {
    if (!confirm(t('למחוק את היעד "{name}"?', { name: goal.name }))) return;
    try { await call('goals:remove', { token, goalId: goal.id }); } catch (e) { toast(errMsg(e)); }
  }

  return (
    <>
      <h2>{t('יעדי חיסכון')}</h2>
      {data.goals.length === 0 && <div className="empty">{t('עוד אין יעדי חיסכון.')}</div>}
      {data.goals.map((goal) => {
        const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
        const done = goal.saved >= goal.target;
        return (
          <div className="goal card" key={goal.id}>
            <div className="goal-head">
              <strong>{isParent && who(goal.personId) ? `${who(goal.personId).avatar || ''} ${who(goal.personId).name} · ` : ''}{goal.name}{done ? ' 🎉' : ''}</strong>
              <button className="small danger" type="button" onClick={() => remove(goal)}>{t('מחיקה')}</button>
            </div>
            <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="goal-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="hint">{t('{saved} מתוך {target} ({pct}%)', { saved: money(goal.saved, goal.currency), target: money(goal.target, goal.currency), pct })}</div>
            {goal.pending.map((p) => (
              <div className="row" key={p.id}>
                <div className="text">{t('ממתין לאישור: {amount}', { amount: money(p.amount, goal.currency) })}</div>
                {isParent && (
                  <>
                    <AsyncButton className="small okbtn" onClick={decide(p.id, true)}>{t('אישור')}</AsyncButton>
                    <AsyncButton className="small danger" onClick={decide(p.id, false)}>{t('דחייה')}</AsyncButton>
                  </>
                )}
              </div>
            ))}
            {!done && (
              <div className="goal-dep">
                <input type="number" inputMode="decimal" min="0.01" step="0.01" aria-label={t('סכום ({cur})', { cur: currencySymbol(goal.currency) })}
                  placeholder={currencySymbol(goal.currency)} value={dep[goal.id] || ''} onChange={(e) => setDep((d) => ({ ...d, [goal.id]: e.target.value }))} />
                <AsyncButton className="small strongbtn" onClick={() => deposit(goal)}>{isParent ? t('הפקדה') : t('הפקדתי')}</AsyncButton>
              </div>
            )}
          </div>
        );
      })}
      <form className="form card" autoComplete="off" onSubmit={addGoal}>
        <h3>{t('יעד חדש')}</h3>
        {isParent && (
          <div className="field"><span>{t('למי')}</span>
            <Select value={owner} onChange={setOwner} options={kids.map((p) => ({ value: p.id, label: (p.avatar ? `${p.avatar} ` : '') + p.name }))} /></div>
        )}
        <label className="field"><span>{t('על מה חוסכים?')}</span>
          <input type="text" maxLength={40} required placeholder={t('למשל: אופניים')} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>{t('כמה צריך? ({cur})', { cur: currencySymbol(data.family.currency) })}</span>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit">{t('הוספה')}</button>
      </form>
    </>
  );
}
