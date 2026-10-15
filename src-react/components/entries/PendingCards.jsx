import { isPending, money, moneyWithValue, curOf, fmtDate, namesFor } from '../../lib/computations.js';
import { useRun } from '../../lib/useRun.js';
import { useSheet } from '../shared/Sheet.jsx';
import { FriendApproveSheet } from '../family/FriendApproveSheet.jsx';
import { g } from '../../lib/gender.js';

// גרסת React של renderPending() הישן. הורה: כרטיסי אישורים בראש הסקירה
// המשפחתית. אחרים: הודעה קטנה בדף הבית. המסך מתרנדר מחדש לבד עם ה-data.
export default function PendingCards({ data, token, parentView }) {
  const run = useRun(token);
  const sheet = useSheet();
  const openFriendApprove = (p) => sheet.open('מצב חברים ל' + p.name, <FriendApproveSheet person={p} />);
  const list = data.entries.filter(isPending);
  const { nameOf, genderOf } = namesFor(null, (id) => data.people.find((p) => p.id === id));

  if (!parentView) {
    if (!list.length) return null;
    return (
      <div className="card notice">
        <p>⏳ {list.length === 1 ? 'רישום אחד מחכה' : list.length + ' רישומים מחכים'} לאישור של הורה. אפשר לראות אותם ב"מה היה".</p>
      </div>
    );
  }

  const friendReqs = data.people.filter((p) => p.friendsRequested);
  const sorted = [...list].sort((x, y) => x.createdAt - y.createdAt);

  return (
    <>
      {friendReqs.length > 0 && (
        <div className="card pending-card">
          <h3>🤝 בקשות למצב חברים ({friendReqs.length})</h3>
          {friendReqs.map((p) => (
            <div className="row" key={p.id}>
              <div className="text">
                <div>{p.name} {g(p.gender, 'מבקש', 'מבקשת', 'מבקש/ת')} לרשום חובות עם חברים</div>
                <div className="meta">חברים נוספים לפי כתובת מייל. תראו כל מה שנרשם בסקירה.</div>
              </div>
              <div className="acts">
                <button className="small okbtn" type="button" onClick={() => openFriendApprove(p)}>✅ אישור</button>
                <button className="small danger" type="button"
                  onClick={() => run('friends:declineAccess', { personId: p.id }, 'הבקשה נדחתה')}>דחייה</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="card pending-card">
          <h3>⏳ ממתין לאישור ({sorted.length})</h3>
          {sorted.map((e) => (
            <div className="row" key={e.id}>
              <div className="text">
                <div>
                  {(e.createdBy ? nameOf(e.createdBy) : 'מישהו')} {g(e.createdBy ? genderOf(e.createdBy) : null, 'רשם', 'רשמה', 'רשם/ה')}:{' '}
                  {nameOf(e.from)} {e.kind === 'debt' ? g(genderOf(e.from), 'חייב', 'חייבת', 'חייב/ת') : g(genderOf(e.from), 'החזיר', 'החזירה', 'החזיר/ה')} ל{nameOf(e.to)}
                </div>
                <div className="meta">{[moneyWithValue(e.amount, curOf(e)), fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
              </div>
              <div className="acts">
                <button className="small okbtn" type="button"
                  onClick={() => run('entries:approve', { id: e.id }, 'אושר ✅')}>✅ אישור</button>
                <button className="small danger" type="button"
                  onClick={() => { if (confirm('לדחות? הרישום יימחק.')) run('entries:reject', { id: e.id }, 'הרישום נדחה'); }}>דחייה</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
