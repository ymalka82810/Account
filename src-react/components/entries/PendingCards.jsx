import { t } from '../../i18n/index.js';
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
  const openFriendApprove = (p) => sheet.open(t('מצב חברים ל{name}', { name: p.name }), <FriendApproveSheet person={p} />);
  const list = data.entries.filter(isPending);
  const { nameOf, genderOf, owesLine, repaidLine } = namesFor(null, (id) => data.people.find((p) => p.id === id));

  if (!parentView) {
    if (!list.length) return null;
    return (
      <div className="card notice">
        <p>{list.length === 1 ? t('⏳ רישום אחד מחכה לאישור של הורה. אפשר לראות אותם ב"מה היה".') : t('⏳ {n} רישומים מחכים לאישור של הורה. אפשר לראות אותם ב"מה היה".', { n: list.length })}</p>
      </div>
    );
  }

  const friendReqs = data.people.filter((p) => p.friendsRequested);
  const sorted = [...list].sort((x, y) => x.createdAt - y.createdAt);

  return (
    <>
      {friendReqs.length > 0 && (
        <div className="card pending-card">
          <h3>{t('🤝 בקשות למצב חברים ({n})', { n: friendReqs.length })}</h3>
          {friendReqs.map((p) => (
            <div className="row" key={p.id}>
              <div className="text">
                <div>{g(p.gender, '{name} מבקש לרשום חובות עם חברים', '{name} מבקשת לרשום חובות עם חברים', '{name} מבקש/ת לרשום חובות עם חברים', { name: p.name })}</div>
                <div className="meta">{t('חברים נוספים לפי כתובת מייל. תראו כל מה שנרשם בסקירה.')}</div>
              </div>
              <div className="acts">
                <button className="small okbtn" type="button" onClick={() => openFriendApprove(p)}>{t('✅ אישור')}</button>
                <button className="small danger" type="button"
                  onClick={() => run('friends:declineAccess', { personId: p.id }, t('הבקשה נדחתה'))}>{t('דחייה')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="card pending-card">
          <h3>{t('⏳ ממתין לאישור ({n})', { n: sorted.length })}</h3>
          {sorted.map((e) => (
            <div className="row" key={e.id}>
              <div className="text">
                <div>
                  {g(e.createdBy ? genderOf(e.createdBy) : null, '{who} רשם: {line}', '{who} רשמה: {line}', '{who} רשם/ה: {line}', { who: e.createdBy ? nameOf(e.createdBy) : t('מישהו'), line: e.kind === 'debt' ? owesLine(e.from, e.to) : repaidLine(e.from, e.to) })}
                </div>
                <div className="meta">{[moneyWithValue(e.amount, curOf(e)), fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
              </div>
              <div className="acts">
                <button className="small okbtn" type="button"
                  onClick={() => run('entries:approve', { id: e.id }, t('אושר ✅'))}>{t('✅ אישור')}</button>
                <button className="small danger" type="button"
                  onClick={() => { if (confirm(t('לדחות? הרישום יימחק.'))) run('entries:reject', { id: e.id }, t('הרישום נדחה')); }}>{t('דחייה')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
