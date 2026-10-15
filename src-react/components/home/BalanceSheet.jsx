import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { call } from '../../lib/api.js';
import { state } from '../../state/state.js';
import { today, toast, errMsg } from '../../lib/helpers.js';
import { openDebtsOf, pairOwes, debtLabel, money, namesFor } from '../../lib/computations.js';
import { g } from '../../lib/gender.js';

const sum = (list) => list.reduce((s, x) => s + x.remaining, 0);

// חלוקת סכום קיזוז על החובות הפתוחים, מהישן לחדש: [{debt, amount}].
function allocate(open, total) {
  const out = [];
  let left = total;
  for (const x of open) {
    if (left <= 0) break;
    const take = Math.min(left, x.remaining);
    out.push({ debt: x.debt, amount: take });
    left -= take;
  }
  return out;
}

// פירוט איך הגענו לסכום הסופי מול אדם אחד: חובות משני הצדדים, הפרש,
// החזר של ההפרש וקיזוז חובות דו-צדדיים.
export default function BalanceSheet({ otherId }) {
  const { data, me, openEntryFlow } = useApp();
  const sheet = useSheet();
  const other = data.people.find((p) => p.id === otherId);
  const { nameOf } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const myGender = data.me.gender;
  useSheetTitle(`החשבון מול ${other ? nameOf(otherId) : ''}`);
  if (!other) return null;

  const mine = openDebtsOf(me, otherId, data.entries);   // אני חייב
  const theirs = openDebtsOf(otherId, me, data.entries); // חייבים לי
  const sumMine = sum(mine);
  const sumTheirs = sum(theirs);
  const net = pairOwes(me, otherId, data.entries);       // חיובי = אני חייב
  const adjust = -net - (sumTheirs - sumMine);           // התאמות (החזרים ללא חוב מקושר וכד')
  const overlap = Math.min(sumMine, sumTheirs);
  const twoSided = mine.length > 0 && theirs.length > 0;
  const iOwe = net > 0;
  const other_ = nameOf(otherId);

  async function offset() {
    if (!confirm(`לקזז ${money(overlap)} בין החובות ההדדיים מול ${other_}? החובות ייסגרו עד גובה הסכום הזה, ויישאר רק ההפרש.`)) return;
    try {
      const jobs = [
        ...allocate(mine, overlap).map((a) => ({ from: me, to: otherId, ...a })),
        ...allocate(theirs, overlap).map((a) => ({ from: otherId, to: me, ...a })),
      ];
      for (const j of jobs) {
        await call('entries:add', {
          token: state.token, kind: 'payment', from: j.from, to: j.to, amount: j.amount,
          note: 'קיזוז הדדי', date: today(), debtId: j.debt.id,
        });
      }
      toast(data.me.role === 'parent' ? 'החובות קוזזו ✅' : 'הקיזוז נשלח להורה לאישור ⏳');
    } catch (e) { toast(errMsg(e)); }
  }

  function payNet() {
    sheet.close();
    openEntryFlow(iOwe
      ? { kind: 'payment', from: me, to: otherId, suggest: net }
      : { kind: 'payment', from: otherId, to: me, suggest: -net });
  }

  const Rows = ({ list, sign }) => list.map((x) => (
    <div className="calc-row" key={x.debt.id}>
      <span>{debtLabel(x.debt)}{x.paid > 0 ? ` (נשאר מתוך ${money(x.debt.amount)})` : ''}</span>
      <span className={'calc-amt ' + sign}>{money(x.remaining)}</span>
    </div>
  ));

  return (
    <div className="calc">
      <div className="calc-sec">
        <div className="calc-h get">{other_} {g(other.gender, 'חייב', 'חייבת', 'חייב/ת')} לי</div>
        {theirs.length === 0 ? <div className="calc-row"><span>אין</span></div> : <Rows list={theirs} sign="get" />}
        <div className="calc-row calc-total"><span>סה״כ</span><span className="calc-amt get">{money(sumTheirs)}</span></div>
      </div>

      <div className="calc-sec">
        <div className="calc-h owe">{g(myGender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} ל{other_}</div>
        {mine.length === 0 ? <div className="calc-row"><span>אין</span></div> : <Rows list={mine} sign="owe" />}
        <div className="calc-row calc-total"><span>סה״כ</span><span className="calc-amt owe">{money(sumMine)}</span></div>
      </div>

      {adjust !== 0 && (
        <div className="calc-row"><span>התאמות (החזרים שנרשמו בלי חוב מסוים)</span><span className="calc-amt">{money(Math.abs(adjust))}</span></div>
      )}

      <div className="calc-final">
        <div>{net === 0 ? 'מאוזן: אף אחד לא חייב' : iOwe ? `בסך הכול ${g(myGender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} ל${other_}` : `בסך הכול ${other_} ${g(other.gender, 'חייב', 'חייבת', 'חייב/ת')} לי`}</div>
        <div className="calc-eq">{money(sumTheirs)} − {money(sumMine)}{adjust !== 0 ? ` ${adjust > 0 ? '+' : '−'} ${money(Math.abs(adjust))}` : ''} = <strong>{money(Math.abs(net))}</strong></div>
      </div>

      {twoSided && (
        <>
          <AsyncButton className="charcoalbtn" onClick={offset}>קיזוז חובות הדדיים ({money(overlap)})</AsyncButton>
          <p className="calc-hint">הקיזוז סוגר חובות משני הצדדים עד {money(overlap)}. ההפרש נשאר כמו שהוא וההיסטוריה נשמרת.</p>
        </>
      )}
      {net !== 0 && (
        <button type="button" className="charcoalbtn" onClick={payNet}>
          {iOwe ? `שילמתי את ההפרש (${money(net)})` : `קיבלתי את ההפרש (${money(-net)})`}
        </button>
      )}
    </div>
  );
}
