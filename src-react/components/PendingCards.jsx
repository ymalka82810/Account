import { useConvex } from 'convex/react';
import { isPending, money, fmtDate } from '../lib/computations.js';
import { toast, errMsg } from '../../src/helpers.js';
import { useSheet } from './Sheet.jsx';
import { FriendApproveSheet } from './Sheets.jsx';

// גרסת React של renderPending() הישן. הורה: כרטיסי אישורים בראש הסקירה
// המשפחתית. אחרים: הודעה קטנה בדף הבית. המסך מתרנדר מחדש לבד עם ה-data.
export default function PendingCards({ data, token, parentView }) {
  const convex = useConvex();
  const sheet = useSheet();
  const openFriendApprove = (p) => sheet.open('מצב חברים ל' + p.name, <FriendApproveSheet person={p} />);
  const list = data.entries.filter(isPending);
  const nameOf = (id) => data.people.find((p) => p.id === id)?.name ?? 'לא ידוע';

  async function run(name, args, okMsg) {
    try { await convex.mutation(name, { token, ...args }); toast(okMsg); }
    catch (err) { toast(errMsg(err)); }
  }

  if (!parentView) {
    if (!list.length) return null;
    return (
      <div className="card notice">
        <p>⏳ {list.length === 1 ? 'רישום אחד מחכה' : list.length + ' רישומים מחכים'} לאישור של הורה. אפשר לראות אותם ב"מה היה".</p>
      </div>
    );
  }

  const teenReqs = data.people.filter((p) => p.teenRequested);
  const friendReqs = data.people.filter((p) => p.friendsRequested);
  const sorted = [...list].sort((x, y) => x.createdAt - y.createdAt);

  return (
    <>
      {teenReqs.length > 0 && (
        <div className="card pending-card">
          <h3>🎧 בקשות לעבור לנוער ({teenReqs.length})</h3>
          {teenReqs.map((p) => (
            <div className="row" key={p.id}>
              <div className="text">
                <div>{p.name} מבקש/ת להפוך לנער/ה</div>
                <div className="meta">ממשק מותאם לנוער. מצב חברים נפרד ודורש אישור נוסף.</div>
              </div>
              <div className="acts">
                <button className="small okbtn" type="button"
                  onClick={() => run('people:setRole', { id: p.id, role: 'teen' }, `${p.name} עכשיו נער/ה`)}>✅ אישור</button>
                <button className="small danger" type="button"
                  onClick={() => run('people:declineTeen', { id: p.id }, 'הבקשה נדחתה')}>דחייה</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friendReqs.length > 0 && (
        <div className="card pending-card">
          <h3>🤝 בקשות למצב חברים ({friendReqs.length})</h3>
          {friendReqs.map((p) => (
            <div className="row" key={p.id}>
              <div className="text">
                <div>{p.name} מבקש/ת לרשום חובות עם חברים</div>
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
                  {(e.createdBy ? nameOf(e.createdBy) : 'מישהו')} רשם/ה: {nameOf(e.from)} {e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ל{nameOf(e.to)}
                </div>
                <div className="meta">{[money(e.amount), fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
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
