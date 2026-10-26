import { useApp } from '../../state/appContext.js';
import { GoldBarArt, SumNum } from '../shared/GoldBar.jsx';
import { useSheet } from '../shared/Sheet.jsx';
import BalanceSheet from './BalanceSheet.jsx';
import PendingCards from '../entries/PendingCards.jsx';
import DebtLines from '../entries/DebtLines.jsx';
import { pairOwes, openDebtsOf, money, namesFor } from '../../lib/computations.js';
import { g } from '../../lib/gender.js';

// מסך הבית: סיכום, כפתורי רישום, אישורים ממתינים והחובות הפתוחים.
// ההגדרות האישיות נמצאות ב"החשבון שלי" (AccountSheet), בכותרת.
export default function Home({ data, token }) {
  const { openEntryFlow } = useApp();
  const sheet = useSheet();
  const me = data.me.id;
  const { nameOf } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  let owe = 0, get = 0;
  const cards = [];

  for (const p of data.people) {
    if (p.id === me) continue;
    const n = pairOwes(me, p.id, data.entries);
    if (n === 0) continue;
    const iOwe = n > 0;
    const amount = Math.abs(n);
    if (iOwe) owe += amount; else get += amount;
    const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
    const open = openDebtsOf(dFrom, dTo, data.entries);

    cards.push(
      <div key={p.id} className={'debt ' + (iOwe ? 'owe' : 'get')}>
        {p.avatar && <div className="debt-avatar avatar-md" aria-hidden="true">{p.avatar}</div>}
        <button type="button" className="debt-total" aria-label="פירוט החישוב"
          onClick={() => sheet.open('', <BalanceSheet otherId={p.id} />)}>
          <span className="who">{iOwe ? `${g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} ל${nameOf(p.id)}` : `${nameOf(p.id)} ${g(p.gender, 'חייב', 'חייבת', 'חייב/ת')} לי`}</span>
          <span className="amt">{money(amount)}</span>
          <span className="debt-more">לחצו לפירוט החישוב ‹</span>
        </button>
        <DebtLines open={open} iOwe={iOwe} onPay={(x) => openEntryFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })} />
        {open.length === 0 && (
          <button className="small charcoalbtn" type="button"
            onClick={() => openEntryFlow(iOwe
              ? { kind: 'payment', from: me, to: p.id, suggest: amount }
              : { kind: 'payment', from: p.id, to: me, suggest: amount })}>
            {iOwe ? 'שילמתי' : 'קיבלתי'}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="summary">
        <div className="sum owe"><GoldBarArt /><div className="lbl">{g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')}</div><SumNum>{money(owe)}</SumNum></div>
        <div className="sum get"><GoldBarArt /><div className="lbl">חייבים לי</div><SumNum>{money(get)}</SumNum></div>
      </div>

      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => openEntryFlow({ kind: 'debt', from: me })}>
          <span aria-hidden="true">💸</span>{g(data.me.gender, 'אני חייב כסף', 'אני חייבת כסף', 'אני חייב/ת כסף')}
        </button>
        <button className="bigbtn get" type="button" onClick={() => openEntryFlow({ kind: 'debt', to: me })}>
          <span aria-hidden="true">🤝</span>חייבים לי כסף
        </button>
      </div>

      <div id="pendingBox">
        {data.me.role !== 'parent' && <PendingCards data={data} token={token} parentView={false} />}
      </div>

      <h2>מי חייב למי</h2>
      <div id="myDebts">
        {data.people.length < 2 ? (
          <div className="empty">עוד אין אף אחד אחר במשפחה. הורה צריך להוסיף אותם.</div>
        ) : cards.length === 0 ? (
          <div className="empty"><div className="big-emoji" aria-hidden="true">🎉</div>אף אחד לא חייב כלום!</div>
        ) : cards}
      </div>
    </>
  );
}
