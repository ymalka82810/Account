import { useState } from 'react';
import { t, tn, intlLocale } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { money } from '../../lib/computations.js';
import { lastMonths, monthKey, monthTotals, shiftMonth, todayIso, topDebtors } from '../../lib/stats.js';
import Arrow from '../shared/Arrow.jsx';

const monthName = (key) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });

// סיכום חודשי (הורים): חובות שנרשמו, החזרים והשינוי בחוב לחודש שנבחר. הגרף ו"מי חייב הכי הרבה" נפתחים בחלון (StatsSheet).
export default function Summary({ entries, onMore }) {
  const thisMonth = monthKey(todayIso());
  const [month, setMonth] = useState(thisMonth);
  const cur = lastMonths(entries, month).at(-1);
  const prev = monthTotals(entries, shiftMonth(month, -1));
  const net = cur.debts - cur.payments;

  return (
    <>
      <h2>{t('סיכום חודשי')}</h2>
      <div className="sum-nav">
        <button className="ghost small cal-nav" aria-label={t('חודש קודם')} onClick={() => setMonth(shiftMonth(month, -1))}><Arrow kind="chev-back" /></button>
        <strong>{monthName(month)}</strong>
        <button className="ghost small cal-nav" aria-label={t('חודש הבא')} disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}><Arrow kind="chev-next" /></button>
      </div>

      <div className="sum-cards">
        <div className="sum-card"><div className="what">{t('נרשמו חובות')}</div><div className="num minus">{money(cur.debts)}</div></div>
        <div className="sum-card"><div className="what">{t('הוחזרו')}</div><div className="num plus">{money(cur.payments)}</div></div>
        <div className="sum-card"><div className="what">{net > 0 ? t('החוב גדל ב') : t('החוב קטן ב')}</div><div className="num">{money(Math.abs(net))}</div></div>
      </div>
      {cur.count === 0 && <div className="hint">{t('לא נרשם כלום בחודש הזה.')}</div>}
      {prev.count > 0 && cur.debts !== prev.debts && (
        <div className="hint">{t('חובות חדשים לעומת החודש הקודם: {diff}', { diff: (cur.debts > prev.debts ? '+' : '−') + money(Math.abs(cur.debts - prev.debts)) })}</div>
      )}

      <button className="fam-row fam-link" type="button" onClick={onMore}>
        <span className="fam-name">{t('גרף חובות והחזרים לפי חודש')}</span><Arrow kind="chev-next" />
      </button>
    </>
  );
}

// הגרף של 6 החודשים האחרונים ו"מי חייב הכי הרבה", בחלון תחתון.
export function StatsSheet() {
  const { data } = useApp();
  const months = lastMonths(data.entries, monthKey(todayIso()));
  const max = Math.max(1, ...months.flatMap((m) => [m.debts, m.payments]));
  const debtors = topDebtors(data.entries);
  const top = Math.max(1, ...debtors.map((d) => d.amount));
  const empty = months.every((m) => m.debts === 0 && m.payments === 0);

  return (
    <>
      {empty ? <div className="empty empty-sm">{t('לא נרשם כלום בחודש הזה.')}</div> : (
        <>
          <div className="sum-chart" role="img" aria-label={t('גרף חובות והחזרים לפי חודש')}>
            {months.map((m) => (
              <div className="sum-col" key={m.key}>
                <div className="sum-bars">
                  <div className="sum-bar debt" style={{ height: `${(m.debts / max) * 100}%` }} title={money(m.debts)} />
                  <div className="sum-bar paid" style={{ height: `${(m.payments / max) * 100}%` }} title={money(m.payments)} />
                </div>
                <div className="sum-lbl">{new Date(`${m.key}-01T12:00:00`).toLocaleDateString(intlLocale(), { month: 'short' })}</div>
              </div>
            ))}
          </div>
          <div className="sum-legend"><span className="dot debt" /> {t('חובות')} <span className="dot paid" /> {t('החזרים')}</div>
        </>
      )}

      <h2>{t('מי חייב הכי הרבה')}</h2>
      {debtors.length === 0 && <div className="empty empty-sm">{t('אף אחד לא חייב כלום.')}</div>}
      {debtors.map((d) => {
        const p = data.people.find((x) => x.id === d.id);
        return (
          <div className="debt open-debt" key={d.id}>
            <div className="who">
              {p ? `${p.avatar ? p.avatar + ' ' : ''}${p.name}` : t('לא ידוע')}
              <div className="hint">{d.days === 0 ? t('מהיום') : tn(d.days, 'כבר יום אחד', 'כבר {n} ימים')}</div>
              <div className="bal-bar"><div className="bal-bar-fill sum-fill" style={{ width: `${(d.amount / top) * 100}%` }} /></div>
            </div>
            <div className="amt">{money(d.amount)}</div>
          </div>
        );
      })}
    </>
  );
}
