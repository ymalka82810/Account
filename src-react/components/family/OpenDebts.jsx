import { t } from '../../i18n/index.js';
import { money } from '../../lib/computations.js';

// כל החובות הפתוחים במשפחה: מי חייב למי, והסכום. לקריאה בלבד (בלי כפתורי תשלום).
export default function OpenDebts({ debts, owesLine }) {
  return (
    <div id="debts">
      {debts.length === 0 && <div className="empty">{t('אף אחד לא חייב כלום.')}</div>}
      {debts.map((d) => (
        <div className="debt open-debt" key={d.debtor + d.creditor}>
          <div className="who">{owesLine(d.debtor, d.creditor)}</div>
          <div className="amt">{money(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}
