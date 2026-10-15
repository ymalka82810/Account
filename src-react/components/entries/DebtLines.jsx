import { debtLabel, money, debtLeftText } from '../../lib/computations.js';

// פירוט חובות פתוחים בתוך כרטיס חוב: שורה לכל חוב (גם חוב יחיד), עם כפתור שילמתי/קיבלתי משלו.
export default function DebtLines({ open, iOwe, onPay }) {
  if (open.length === 0) return null;
  return (
    <div className="debt-lines">
      {open.map((x) => (
        <div className="debt-line" key={x.debt.id}>
          <div className="dl-text">
            <div className="dl-name">{debtLabel(x.debt)}</div>
            <div className="dl-rem">{debtLeftText(x)}</div>
          </div>
          <button className="small charcoalbtn" type="button" onClick={() => onPay(x)}>{iOwe ? 'שילמתי' : 'קיבלתי'}</button>
        </div>
      ))}
    </div>
  );
}
