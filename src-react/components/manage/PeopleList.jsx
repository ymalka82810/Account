import { useSheet } from '../shared/Sheet.jsx';
import { ResetPinSheet } from './ResetPinSheet.jsx';
import { useRun } from '../../lib/useRun.js';
import { roleLabel } from '../../lib/computations.js';

// בני המשפחה: קוד חדש, ילד/נער, כיבוי מצב חברים והסרה.
export default function PeopleList({ people, me, token }) {
  const sheet = useSheet();
  const run = useRun(token);

  function toggleRole(p) {
    const toRole = p.role === 'teen' ? 'child' : 'teen';
    if (toRole === 'child' && p.friendsEnabled && !confirm(`${p.name} יאבד/תאבד את מצב החברים. להמשיך?`)) return;
    run('people:setRole', { id: p.id, role: toRole }, toRole === 'teen' ? `${p.name} עכשיו נער/ה` : `${p.name} עכשיו ילד/ה`);
  }

  return (
    <div id="peopleList">
      {people.map((p) => (
        <div className="person" key={p.id}>
          {p.avatar && <span className="avatar-md" aria-hidden="true">{p.avatar}</span>}
          <div className="text">
            {p.name}{' '}
            <span className="meta">{roleLabel(p.role) + (p.hasPin ? '' : ' • עוד לא בחר/ה קוד')}</span>
            {p.lockAlert && (
              <div className="meta" style={{ color: '#b45309' }}>
                ⚠️ הקוד של {p.name} ננעל {p.lockAlert.count === 1 ? 'פעם אחת' : p.lockAlert.count + ' פעמים'} אחרי ניסיונות שגויים. אם זה לא הוא/היא, כדאי לקבוע קוד חדש.
              </div>
            )}
            {p.role === 'teen' && p.friendsEnabled && <div className="meta">🤝 מצב חברים פעיל • {p.friendEmail || ''}</div>}
          </div>
          <button className="small" type="button" onClick={() => sheet.open('קוד סודי ל' + p.name, <ResetPinSheet person={p} />)}>קוד חדש</button>
          {p.role !== 'parent' && (
            <button className="small" type="button" onClick={() => toggleRole(p)}>
              {p.role === 'teen' ? 'חזרה לילד/ה' : 'הפיכה לנער/ה'}
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
              run('people:remove', { id: p.id }, `${p.name} הוסר/ה`);
            }}>הסרה</button>
          )}
        </div>
      ))}
    </div>
  );
}
