import { t } from '../../i18n/index.js';
import { money, fmtDate } from '../../lib/computations.js';
import { g } from '../../lib/gender.js';

// מה הנוער רושם עם חברים (לקריאה בלבד).
export default function TeenOverview({ teens }) {
  if (!teens.length) return null;
  return (
    <div id="teenFriendsRoot">
      <h2>{t('מה הנוער רושם עם חברים')}</h2>
      <p className="hint">{t('לקריאה בלבד. כל רישום עם חבר/ה ממתין גם לאישור שלהם.')}</p>
      {teens.map((teen) => (
        <div className="card teen-card" key={teen.name}>
          <h3>🤝 {teen.name}</h3>
          <div className="meta">{teen.friends.length ? t('חברים: {names}', { names: teen.friends.join(', ') }) : t('עוד אין חברים מאושרים')}</div>
          {teen.entries.length === 0 && <div className="empty">{t('עוד לא נרשם כלום.')}</div>}
          {teen.entries.map((e, i) => (
            <div className="row" key={i}>
              <div className="text">
                <div>
                  <span className={'tag tag-' + e.kind}>{e.kind === 'debt' ? t('חוב') : t('החזר')}</span>
                  {e.status === 'pending' && <span className="tag pending">{t('⏳ ממתין לחבר/ה')}</span>}
                  {' '}{e.kind === 'debt'
                    ? g(e.fromGender, '{from} חייב ל{to}', '{from} חייבת ל{to}', '{from} חייב/ת ל{to}', { from: e.fromName, to: e.toName })
                    : g(e.fromGender, '{from} החזיר ל{to}', '{from} החזירה ל{to}', '{from} החזיר/ה ל{to}', { from: e.fromName, to: e.toName })}
                </div>
                <div className="meta">{[fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
              </div>
              <strong>{money(e.amount, 'ILS')}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
