import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet } from '../shared/Sheet.jsx';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { money } from '../../lib/computations.js';
import { currencySymbol } from '../../lib/currencies.js';
import AsyncButton from '../shared/AsyncButton.jsx';
import Select from '../shared/Select.jsx';
import { useConfirm } from '../shared/Confirm.jsx';

const toMinor = (s) => Math.round(parseFloat(s) * 100);

// טופס "יעד חדש" בחלון תחתון. הורה פותח אותו מהדף האישי של ילד/ה (ownerId) או בוחר למי; ילד/ה ונער/ה פותחים רק לעצמם.
export function NewGoalSheet({ ownerId }) {
  const { data, token } = useApp();
  const sheet = useSheet();
  const isParent = data.me.role === 'parent';
  const kids = data.people.filter((p) => p.role !== 'parent');
  const [owner, setOwner] = useState(ownerId || kids[0]?.id);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  async function addGoal(ev) {
    ev.preventDefault();
    setError('');
    const minor = toMinor(target);
    if (!Number.isFinite(minor) || minor <= 0) { setError(t('כתבו סכום גדול מאפס.')); return; }
    try {
      await call('goals:add', { token, personId: isParent ? owner : undefined, name, target: minor });
      toast(t('היעד נוסף 🎯'));
      sheet.back();
    } catch (e) { setError(errMsg(e)); }
  }

  return (
    <form className="form" autoComplete="off" onSubmit={addGoal}>
      {isParent && !ownerId && (
        <div className="field"><span>{t('למי')}</span>
          <Select value={owner} onChange={setOwner} options={kids.map((p) => ({ value: p.id, label: (p.avatar ? `${p.avatar} ` : '') + p.name }))} /></div>
      )}
      <label className="field"><span>{t('על מה חוסכים?')}</span>
        <input type="text" maxLength={40} required placeholder={t('למשל: אופניים')} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t('כמה צריך? ({cur})', { cur: currencySymbol(data.family.currency) })}</span>
        <input type="text" inputMode="decimal" data-kb="dec" autoComplete="off" required value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit">{t('הוספה')}</button>
    </form>
  );
}

// יעדי חיסכון עם פס התקדמות. ילד/ה ונער/ה רואים את שלהם ומבקשים להפקיד (ממתין לאישור הורה).
// הורה מפקיד ישירות ומאשר הפקדות; ב-personId מוצגים רק היעדים של אדם אחד (הדף האישי שלו).
// יעד חדש נפתח בחלון תחתון ולא בתוך הדף.
export default function Goals({ data, token, personId }) {
  const isParent = data.me.role === 'parent';
  const sheet = useSheet();
  const kids = data.people.filter((p) => p.role !== 'parent');
  const [dep, setDep] = useState({}); // goalId -> טקסט הסכום
  const confirm = useConfirm();
  const who = (id) => data.people.find((p) => p.id === id);
  const goals = personId ? data.goals.filter((x) => x.personId === personId) : data.goals;
  if (isParent && kids.length === 0) return null;

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
    try { await call('goals:decide', { token, depositId: id, approve }); toast(approve ? t('ההפקדה אושרה ✅') : t('ההפקדה נדחתה')); } catch (e) { toast(errMsg(e)); }
  };

  async function remove(goal) {
    if (!(await confirm({ icon: '🗑️', title: t('מחיקה'), message: t('למחוק את היעד "{name}"?', { name: goal.name }), okText: t('מחיקה'), cancelText: t('חזרה'), danger: true }))) return;
    try { await call('goals:remove', { token, goalId: goal.id }); toast(t('נמחק')); } catch (e) { toast(errMsg(e)); }
  }

  return (
    <>
      <div className="sec-row">
        <h2>{t('יעדי חיסכון')}</h2>
        <button className="ghost small" type="button" onClick={() => sheet.open(t('יעד חדש'), <NewGoalSheet ownerId={personId} />)}>+ {t('יעד חדש')}</button>
      </div>
      {goals.length === 0 && <div className="empty empty-sm">{t('עוד אין יעדי חיסכון.')}</div>}
      {goals.map((goal) => {
        const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
        const done = goal.saved >= goal.target;
        return (
          <div className="goal card" key={goal.id}>
            <div className="goal-head">
              <strong>{isParent && !personId && who(goal.personId) ? `${who(goal.personId).avatar || ''} ${who(goal.personId).name} · ` : ''}{goal.name}{done ? ' 🎉' : ''}</strong>
              {(isParent || goal.saved === 0) && <button className="small danger" type="button" onClick={() => remove(goal)}>{t('מחיקה')}</button>}
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
                <input type="text" inputMode="decimal" data-kb="dec" autoComplete="off" aria-label={t('סכום ({cur})', { cur: currencySymbol(goal.currency) })}
                  placeholder={currencySymbol(goal.currency)} value={dep[goal.id] || ''} onChange={(e) => setDep((d) => ({ ...d, [goal.id]: e.target.value }))} />
                <AsyncButton className="small strongbtn" onClick={() => deposit(goal)}>{isParent ? t('הפקדה') : t('הפקדתי')}</AsyncButton>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
