import { money } from '../../lib/computations.js';

// יתרות: כמה מגיע או חייב לכל אחד במשפחה.
export default function Balances({ people, debts }) {
  const bal = new Map(people.map((p) => [p.id, 0]));
  debts.forEach((d) => {
    bal.set(d.creditor, bal.get(d.creditor) + d.amount);
    bal.set(d.debtor, bal.get(d.debtor) - d.amount);
  });
  const max = Math.max(1, ...people.map((p) => Math.abs(bal.get(p.id) || 0)));
  return (
    <div id="balances" className="balances">
      {people.map((p) => {
        const v = bal.get(p.id) || 0;
        return (
          <div className={'bal ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero')} key={p.id}>
            <div className="name">{p.avatar ? `${p.avatar} ` : ''}{p.name}</div>
            <div className="num">{money(Math.abs(v))}</div>
            <div className="what">{v > 0 ? 'מגיע לו/ה' : v < 0 ? 'חייב/ת' : 'הכול מסודר'}</div>
            {v !== 0 && (
              <div className="bal-bar"><div className="bal-bar-fill" style={{ width: `${(Math.abs(v) / max) * 100}%` }} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
