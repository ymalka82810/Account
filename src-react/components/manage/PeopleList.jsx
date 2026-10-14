import { useState } from 'react';
import { useSheet } from '../shared/Sheet.jsx';
import { ResetPinSheet } from './ResetPinSheet.jsx';
import { useRun } from '../../lib/useRun.js';
import { call } from '../../lib/api.js';
import { roleLabel } from '../../lib/computations.js';
import Select from '../shared/Select.jsx';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';

// בני המשפחה: קוד חדש, ילד/נער, כיבוי מצב חברים והסרה.
export default function PeopleList({ people, me, token }) {
  const sheet = useSheet();
  const run = useRun(token);
  const [shownPins, setShownPins] = useState({});

  async function togglePin(p) {
    if (shownPins[p.id] !== undefined) {
      setShownPins((s) => { const n = { ...s }; delete n[p.id]; return n; });
      return;
    }
    const pin = await call('people:getPin', { token, id: p.id });
    setShownPins((s) => ({ ...s, [p.id]: pin }));
  }

  function toggleRole(p) {
    const toRole = p.role === 'teen' ? 'child' : 'teen';
    if (toRole === 'child' && p.friendsEnabled
      && !confirm(`${p.name} ${g(p.gender, 'יאבד', 'תאבד', 'יאבד/תאבד')} את מצב החברים. להמשיך?`)) return;
    run('people:setRole', { id: p.id, role: toRole }, `${p.name} עכשיו ${roleLabel(toRole, p.gender)}`);
  }

  function changeGender(p, gender) {
    run('people:setGender', { id: p.id, gender: gender || undefined });
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
            <div className="meta">
              צורת פנייה:{' '}
              <Select className="dd-inline" value={p.gender || ''} onChange={(gender) => changeGender(p, gender)} options={GENDER_OPTIONS} />
            </div>
          </div>
          {p.role !== 'parent' && p.hasPin && (
            <button className="small" type="button" onClick={() => togglePin(p)}>
              {shownPins[p.id] !== undefined ? 'הסתר קוד' : 'הצג קוד'}
            </button>
          )}
          <button className="small" type="button" onClick={() => sheet.open('קוד סודי ל' + p.name, <ResetPinSheet person={p} />)}>קוד חדש</button>
          {p.role !== 'parent' && (
            <button className="small" type="button" onClick={() => toggleRole(p)}>
              {p.role === 'teen' ? `חזרה ל${g(p.gender, 'ילד', 'ילדה', 'ילד/ה')}` : `הפיכה ל${g(p.gender, 'נער', 'נערה', 'נער/ה')}`}
            </button>
          )}
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
