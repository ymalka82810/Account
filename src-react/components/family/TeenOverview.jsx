import { money, fmtDate } from '../../lib/computations.js';

// מה הנוער רושם עם חברים (לקריאה בלבד).
export default function TeenOverview({ teens }) {
  if (!teens.length) return null;
  return (
    <div id="teenFriendsRoot">
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
    </div>
  );
}
