import { useState } from 'react';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import { toast, errMsg } from '../../lib/helpers.js';
import { BioError } from '../../lib/biometric.js';
import { useSheet } from '../shared/Sheet.jsx';
import { ResetPinSheet } from './ResetPinSheet.jsx';
import { useRun } from '../../lib/useRun.js';
import { call } from '../../lib/api.js';
import { roleLabel } from '../../lib/computations.js';
import Select from '../shared/Select.jsx';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';

// כאן זו קביעה ראשונית וחד-פעמית (לא ניתנת לשינוי אחר כך), אז בלי אפשרות "ללא ציון".
const GENDER_SET_OPTIONS = GENDER_OPTIONS.filter((o) => o.value);
const GENDER_PLACEHOLDER = [{ value: '', label: 'קביעת צורת פנייה…' }, ...GENDER_SET_OPTIONS];

// בני המשפחה: קוד חדש, תפקיד (ילד/נער/הורה, באישור ביומטרי), כיבוי מצב חברים והסרה.
export default function PeopleList({ people, me, token }) {
  const sheet = useSheet();
  const run = useRun(token);
  const confirm = useConfirm();
  const [shownPins, setShownPins] = useState({});
  const [roleBusy, setRoleBusy] = useState(null);
  const bioConfirm = useBioConfirm();

  async function togglePin(p) {
    if (shownPins[p.id] !== undefined) {
      setShownPins((s) => { const n = { ...s }; delete n[p.id]; return n; });
      return;
    }
    const pin = await call('people:getPin', { token, id: p.id });
    setShownPins((s) => ({ ...s, [p.id]: pin }));
  }

  // שינוי תפקיד (ילד/ה, נער/ה, הורה) דורש אישור בטביעת אצבע או זיהוי פנים.
  async function changeRole(p, toRole) {
    if (!toRole || toRole === p.role || roleBusy) return;
    if (p.role === 'teen' && p.friendsEnabled && !(await confirm({
      icon: '🤝',
      title: 'ביטול מצב חברים',
      amount: p.name,
      message: `${g(p.gender, 'יאבד', 'תאבד', 'יאבד/תאבד')} את מצב החברים. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.`,
      okText: 'כן, להמשיך',
      danger: true,
    }))) return;
    if (toRole === 'parent' && !(await confirm({
      icon: '🔐',
      title: 'הענקת הרשאות הורה',
      amount: p.name,
      message: `${g(p.gender, 'יקבל', 'תקבל', 'יקבל/תקבל')} הרשאות הורה מלאות: לראות הכול, לאשר, למחוק ולנהל את המשפחה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.`,
      okText: 'כן, להמשיך',
    }))) return;
    if (p.role === 'parent' && !(await confirm({
      icon: '⚠️',
      title: 'ביטול הרשאות הורה',
      amount: p.name,
      message: `${g(p.gender, 'יאבד', 'תאבד', 'יאבד/תאבד')} את הרשאות ההורה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.`,
      okText: 'כן, להמשיך',
      danger: true,
    }))) return;
    setRoleBusy(p.id);
    try {
      const proof = await bioConfirm(`role:${p.id}:${toRole}`);
      await call('people:setRole', { token, id: p.id, role: toRole, proof });
      toast(`${p.name} עכשיו ${roleLabel(toRole, p.gender)} ✅`);
    } catch (e) {
      toast(e instanceof BioError ? e.message : errMsg(e));
    } finally { setRoleBusy(null); }
  }

  function changeGender(p, gender) {
    run('people:setGender', { id: p.id, gender });
  }

  return (
    <div id="peopleList">
      {people.map((p) => (
        <div className="person" key={p.id}>
          {p.avatar && <span className="avatar-md" aria-hidden="true">{p.avatar}</span>}
          <div className="text">
            {p.name}{' '}
            <span className="meta">
              {roleLabel(p.role, p.gender) + (p.hasPin ? '' : ' • ' + g(p.gender, 'עוד לא בחר קוד', 'עוד לא בחרה קוד', 'עוד לא בחר/ה קוד'))}
            </span>
            {p.lockAlert && (
              <div className="meta" style={{ color: '#b45309' }}>
                ⚠️ הקוד של {p.name} ננעל {p.lockAlert.count === 1 ? 'פעם אחת' : p.lockAlert.count + ' פעמים'} אחרי ניסיונות שגויים.
                {' '}{g(p.gender, 'אם זה לא הוא', 'אם זה לא היא', 'אם זה לא הוא/היא')}, כדאי לקבוע קוד חדש.
              </div>
            )}
            {p.role === 'teen' && p.friendsEnabled && <div className="meta">🤝 מצב חברים פעיל • {p.friendEmail || ''}</div>}
            {shownPins[p.id] !== undefined && (
              <div className="meta">
                {shownPins[p.id] ? <>הקוד הנוכחי: <strong>{shownPins[p.id]}</strong></> : 'הקוד נקבע לפני העדכון ואי אפשר להציג אותו. אפשר לקבוע קוד חדש.'}
              </div>
            )}
            {p.id !== me && (
              <div className="meta">
                תפקיד:{' '}
                {roleBusy === p.id ? <span>⏳ מאמתים…</span> : (
                  <Select className="dd-inline" value={p.role} onChange={(r) => changeRole(p, r)} options={[
                    { value: 'child', label: g(p.gender, 'ילד', 'ילדה', 'ילד/ה') },
                    { value: 'teen', label: g(p.gender, 'נער', 'נערה', 'נער/ה') },
                    { value: 'parent', label: 'הורה' },
                  ]} />
                )}
                {' '}<span aria-hidden="true">🔒</span>
              </div>
            )}
            <div className="meta">
              צורת פנייה:{' '}
              {p.gender ? (
                <span>{g(p.gender, 'זכר', 'נקבה')}</span>
              ) : (
                <Select className="dd-inline" value="" onChange={(gender) => gender && changeGender(p, gender)} options={GENDER_PLACEHOLDER} />
              )}
            </div>
          </div>
          {p.role !== 'parent' && p.hasPin && (
            <button className="small" type="button" onClick={() => togglePin(p)}>
              {shownPins[p.id] !== undefined ? 'הסתר קוד' : 'הצג קוד'}
            </button>
          )}
          <button className="small" type="button" onClick={() => sheet.open('קוד סודי ל' + p.name, <ResetPinSheet person={p} />)}>קוד חדש</button>
          {p.role === 'teen' && p.friendsEnabled && (
            <button className="small danger" type="button" onClick={() => {
              if (!confirm(`לכבות את מצב החברים של ${p.name}? אי אפשר יהיה להוסיף רישומים חדשים עם חברים.`)) return;
              run('friends:disableAccess', { personId: p.id }, 'מצב חברים כובה');
            }}>כיבוי חברים</button>
          )}
          {p.id !== me && (
            <button className="small danger" type="button" aria-label={'הסרת ' + p.name} onClick={() => {
              if (!confirm(`להסיר את ${p.name} מהמשפחה?`)) return;
              run('people:remove', { id: p.id }, `${p.name} ${g(p.gender, 'הוסר', 'הוסרה', 'הוסר/ה')}`);
            }}>הסרה</button>
          )}
        </div>
      ))}
    </div>
  );
}
