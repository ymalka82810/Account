import { today } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useRun } from '../../lib/useRun.js';
import { money } from '../../lib/computations.js';

// כל החובות הפתוחים במשפחה, עם החזר חלקי או סגירה מלאה.
export default function OpenDebts({ debts, token, nameOf }) {
  const { openEntryFlow } = useApp();
  const run = useRun(token);

  function payAll(d) {
    if (!confirm(`${nameOf(d.debtor)} סגר/ה את כל החוב (${money(d.amount)})?`)) return;
    run('entries:add', { kind: 'payment', from: d.debtor, to: d.creditor, amount: d.amount, note: 'סגירת חוב', date: today() }, 'החוב נסגר ✅');
  }

  return (
    <div id="debts">
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
    </div>
  );
}
