import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { money, namesFor, openDebts } from '../../lib/computations.js';

// החובות הפתוחים: מי חייב למי, והסכום. לקריאה בלבד (בלי כפתורי תשלום).
export default function OpenDebts({ debts, owesLine }) {
  return (
    <div>
      {debts.length === 0 && <div className="empty empty-sm">{t('אף אחד לא חייב כלום.')}</div>}
      {debts.map((d) => (
        <div className="debt open-debt" key={d.debtor + d.creditor}>
          <div className="who">{owesLine(d.debtor, d.creditor)}</div>
          <div className="amt">{money(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}

// כל החובות הפתוחים של המשפחה, בחלון תחתון (מהנתונים החיים).
export function OpenDebtsSheet() {
  const { data, me } = useApp();
  const { owesLine } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  return <OpenDebts debts={openDebts(data.people, data.entries)} owesLine={owesLine} />;
}
