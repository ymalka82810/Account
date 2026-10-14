import { useConvex } from 'convex/react';
import { today, toast, errMsg } from '../../src/helpers.js';
import { useApp } from '../appContext.js';
import { useSheet } from './Sheet.jsx';
import { ResetPinSheet } from './Sheets.jsx';
import { openDebts, roleLabel, namesFor, money, fmtDate } from '../lib/computations.js';
import EntriesList from './EntriesList.jsx';
import PendingCards from './PendingCards.jsx';
import Legacy from './Legacy.jsx';
import Codes from './Codes.jsx';
import Recurring from './Recurring.jsx';
import PersonForm from './PersonForm.jsx';
import FamilyTools from './FamilyTools.jsx';

// לשונית המשפחה (הורים): אישורים, קודים, יתרות, חובות, דמי כיס, בני משפחה והגדרות.
// כל קטע הוא div עם id, כדי שיהיה קל למצוא אותו ב-DevTools.
function At({ id, className, children }) {
  return <div id={id} className={className}>{children}</div>;
}

export default function FamilyTab({ data, fdata, token }) {
  const convex = useConvex();
  const { openEntryFlow } = useApp();
  const sheet = useSheet();
  const me = data.me.id;
  const { nameOf } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const debts = openDebts(data.people, data.entries);
  const bal = new Map(data.people.map((p) => [p.id, 0]));
  debts.forEach((d) => {
    bal.set(d.creditor, bal.get(d.creditor) + d.amount);
    bal.set(d.debtor, bal.get(d.debtor) - d.amount);
  });
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];

  async function run(name, args, okMsg) {
    try { await convex.mutation(name, { token, ...args }); toast(okMsg); }
    catch (e) { toast(errMsg(e)); }
  }

  async function payAll(d) {
    if (!confirm(`${nameOf(d.debtor)} סגר/ה את כל החוב (${money(d.amount)})?`)) return;
    run('entries:add', { kind: 'payment', from: d.debtor, to: d.creditor, amount: d.amount, note: 'סגירת חוב', date: today() }, 'החוב נסגר ✅');
  }

  function toggleRole(p) {
    const toRole = p.role === 'teen' ? 'child' : 'teen';
    if (toRole === 'child' && p.friendsEnabled && !confirm(`${p.name} יאבד/תאבד את מצב החברים. להמשיך?`)) return;
    run('people:setRole', { id: p.id, role: toRole }, toRole === 'teen' ? `${p.name} עכשיו נער/ה` : `${p.name} עכשיו ילד/ה`);
  }

  return (
    <>
      <PendingCards data={data} token={token} parentView />
      <Legacy token={token} />
      <Codes data={data} token={token} />

      <h2>יתרות</h2>
      <At id="balances" className="balances">
        {data.people.map((p) => {
          const v = bal.get(p.id) || 0;
          return (
            <div className={'bal ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero')} key={p.id}>
              <div className="name">{p.avatar} {p.name}</div>
              <div className="num">{money(Math.abs(v))}</div>
              <div className="what">{v > 0 ? 'מגיע לו/ה' : v < 0 ? 'חייב/ת' : 'הכול מסודר'}</div>
            </div>
          );
        })}
      </At>

      <h2>כל החובות הפתוחים</h2>
      <At id="debts">
        {debts.length === 0 && <div className="empty">אף אחד לא חייב כלום.</div>}
        {debts.map((d) => (
          <div className="debt" key={d.debtor + d.creditor}>
            <div className="text">
              <div className="who">{nameOf(d.debtor)} חייב/ת ל{nameOf(d.creditor)}</div>
              <div className="amt">{money(d.amount)}</div>
            </div>
            <button className="small" type="button"
              onClick={() => openEntryFlow({ kind: 'payment', from: d.debtor, to: d.creditor, suggest: d.amount })}>החזר חלקי</button>
            <button className="small" type="button" onClick={() => payAll(d)}>שולם הכול</button>
          </div>
        ))}
      </At>

      <h2>דמי כיס קבועים</h2>
      <p className="hint">רישום חוב אוטומטי, שבועי או חודשי, בלי להקליד כל פעם.</p>
      <Recurring data={data} token={token} />

      <At id="teenFriendsRoot">
        {teens.length > 0 && (
          <>
            <h2>מה הנוער רושם עם חברים</h2>
            <p className="hint">לקריאה בלבד. כל רישום עם חבר/ה ממתין גם לאישור שלהם.</p>
            {teens.map((t) => (
              <div className="card teen-card" key={t.name}>
                <h3>🤝 {t.name}</h3>
                <div className="meta">{t.friends.length ? 'חברים: ' + t.friends.join(', ') : 'עוד אין חברים מאושרים'}</div>
                {t.entries.length === 0 && <div className="empty">עוד לא נרשם כלום.</div>}
                {t.entries.map((e, i) => (
                  <div className="row" key={i}>
                    <div className="text">
                      <div>
                        <span className={'tag ' + e.kind}>{e.kind === 'debt' ? 'חוב' : 'החזר'}</span>
                        {e.status === 'pending' && <span className="tag pending">⏳ ממתין לחבר/ה</span>}
                        {' '}{e.fromName} {e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ל{e.toName}
                      </div>
                      <div className="meta">{[fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
                    </div>
                    <strong>{money(e.amount)}</strong>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </At>

      <h2>בני המשפחה</h2>
      <At id="peopleList">
        {data.people.map((p) => (
          <div className="person" key={p.id}>
            <span className="avatar-md" aria-hidden="true">{p.avatar}</span>
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
      </At>

      <PersonForm token={token} />

      <h2>כל הרשומות</h2>
      <At id="allHistory">
        <EntriesList list={data.entries} emptyText="עדיין אין רשומות." token={token} me={me} isParent
          lookup={(id) => data.people.find((p) => p.id === id)} debtList={data.entries} />
      </At>
      <FamilyTools data={data} token={token} />
    </>
  );
}
