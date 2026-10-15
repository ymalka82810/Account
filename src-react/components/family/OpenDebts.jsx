import { money } from '../../lib/computations.js';

// כל החובות הפתוחים במשפחה: מי חייב למי, והסכום. לקריאה בלבד (בלי כפתורי תשלום).
export default function OpenDebts({ debts, nameOf, gw }) {
  return (
    <div id="debts">
      {debts.length === 0 && <div className="empty">אף אחד לא חייב כלום.</div>}
      {debts.map((d) => (
        <div className="debt open-debt" key={d.debtor + d.creditor}>
          <div className="who">{nameOf(d.debtor)} {gw(d.debtor, 'חייב', 'חייבת', 'חייב/ת')} ל{nameOf(d.creditor)}</div>
          <div className="amt">{money(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}
