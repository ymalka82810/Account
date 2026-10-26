import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import { call } from '../../lib/api.js';
import { state } from '../../state/state.js';
import { today, toast, errMsg } from '../../lib/helpers.js';
import { openDebtsOf, pairOwes, debtLabel, money, namesFor, baseCurrency } from '../../lib/computations.js';
import { currencySymbol, currencyLabel } from '../../lib/currencies.js';
import { g } from '../../lib/gender.js';

// סכום בלי סימני כיוון נסתרים (RLM) ש-toLocaleString מוסיף בעברית, כדי ששורת החישוב תוצג יציב משמאל לימין.
const plain = (agorot) => money(agorot).replace(/[\u200e\u200f\u061c]/g, '').replace(/\s+/g, '');

// הסכומים במטבע הראשי: חוב במטבע אחר נספר לפי השווי שלו היום (value).
const sum = (list) => list.reduce((s, x) => s + x.value, 0);

// סכומים מקובצים לפי מטבע: [{cur, amount}], המטבע הראשי ראשון.
function byCurrency(list) {
  const m = new Map();
  for (const x of list) m.set(x.cur, (m.get(x.cur) || 0) + x.remaining);
  const base = baseCurrency();
  return [...m].map(([cur, amount]) => ({ cur, amount }))
    .sort((a, b) => Number(b.cur === base) - Number(a.cur === base) || a.cur.localeCompare(b.cur));
}
const mixed = (list) => list.some((x) => x.foreign);

// שורת "לפי מטבע" מתחת לסה"כ, רק כשיש חובות במטבע אחר.
const CurrencyBreakdown = ({ list }) => (mixed(list) ? (
  <div className="calc-row calc-bycur"><span>{t('לפי מטבע')}</span>
    <span>{byCurrency(list).map((x) => money(x.amount, x.cur)).join(' + ')}</span></div>
) : null);

// חלוקת סכום קיזוז על החובות הפתוחים, מהישן לחדש: [{debt, amount}].
function allocate(open, total) {
  const out = [];
  let left = total;
  for (const x of open) {
    if (left <= 0) break;
    const take = Math.min(left, x.value);
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
  const confirm = useConfirm();
  const other = data.people.find((p) => p.id === otherId);
  const { nameOf } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const myGender = data.me.gender;
  useSheetTitle(t('החשבון מול {name}', { name: other ? nameOf(otherId) : '' }));
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
    const foreign = mixed(mine) || mixed(theirs);
    const ok = await confirm({
      icon: foreign ? '💱' : '⚖️',
      title: t('קיזוז חובות הדדיים'),
      amount: money(overlap),
      message: t('החובות בינך לבין {name} ייסגרו עד גובה הסכום הזה, ויישאר רק ההפרש. ההיסטוריה נשמרת.', { name: other_ })
        + (foreign ? ' ' + t('יש כאן חובות במטבע אחר: הם יקוזזו לפי השער של היום, והשער הזה יישמר.') : ''),
      ...(foreign ? {
        rowsTitle: t('החובות הפתוחים לפי מטבע'),
        rows: [
          ...byCurrency(theirs).map((x) => ({ label: `${g(other.gender, '{name} חייב לי', '{name} חייבת לי', '{name} חייב/ת לי', { name: other_ })} • ${currencyLabel(x.cur)}`, value: money(x.amount, x.cur) })),
          ...byCurrency(mine).map((x) => ({ label: `${g(myGender, 'אני חייב ל{name}', 'אני חייבת ל{name}', 'אני חייב/ת ל{name}', { name: other_ })} • ${currencyLabel(x.cur)}`, value: money(x.amount, x.cur) })),
        ],
      } : {}),
      okText: t('כן, לקזז'),
      cancelText: t('ביטול'),
    });
    if (!ok) return;
    try {
      const jobs = [
        ...allocate(mine, overlap).map((a) => ({ from: me, to: otherId, ...a })),
        ...allocate(theirs, overlap).map((a) => ({ from: otherId, to: me, ...a })),
      ];
      for (const j of jobs) {
        await call('entries:add', {
          token: state.token, kind: 'payment', from: j.from, to: j.to, amount: j.amount,
          note: t('קיזוז הדדי'), date: today(), debtId: j.debt.id,
        });
      }
      toast(data.me.role === 'parent' ? t('החובות קוזזו ✅') : t('הקיזוז נשלח להורה לאישור ⏳'));
    } catch (e) { toast(errMsg(e)); }
  }

  function payNet() {
    sheet.close();
    openEntryFlow(iOwe
      ? { kind: 'payment', from: me, to: otherId, suggest: net, noDebtPick: true }
      : { kind: 'payment', from: otherId, to: me, suggest: -net, noDebtPick: true });
  }

  const Rows = ({ list, sign }) => list.map((x) => (
    <div className="calc-row" key={x.debt.id}>
      <span>
        {debtLabel(x.debt)}{x.paid > 0 ? ' ' + t('(נשאר מתוך {total})', { total: money(x.debt.amount, x.cur) }) : ''}
        {x.foreign && <> • {t('{amount} לפי {symbol}1 = {rate}', { amount: money(x.remaining, x.cur), symbol: currencySymbol(x.cur), rate: money(Math.round(x.value / x.remaining * 100), baseCurrency()) })}</>}
      </span>
      <span className={'calc-amt ' + sign}>{money(x.value)}</span>
    </div>
  ));

  return (
    <div className="calc">
      <div className="calc-sec">
        <div className="calc-h get">{g(other.gender, '{name} חייב לי', '{name} חייבת לי', '{name} חייב/ת לי', { name: other_ })}</div>
        {theirs.length === 0 ? <div className="calc-row"><span>{t('אין')}</span></div> : <Rows list={theirs} sign="get" />}
        <div className="calc-row calc-total"><span>{t('סה״כ')}</span><span className="calc-amt get">{money(sumTheirs)}</span></div>
        <CurrencyBreakdown list={theirs} />
      </div>

      <div className="calc-sec">
        <div className="calc-h owe">{g(myGender, 'אני חייב ל{name}', 'אני חייבת ל{name}', 'אני חייב/ת ל{name}', { name: other_ })}</div>
        {mine.length === 0 ? <div className="calc-row"><span>{t('אין')}</span></div> : <Rows list={mine} sign="owe" />}
        <div className="calc-row calc-total"><span>{t('סה״כ')}</span><span className="calc-amt owe">{money(sumMine)}</span></div>
        <CurrencyBreakdown list={mine} />
      </div>

      {adjust !== 0 && (
        <div className="calc-row"><span>{t('התאמות (החזרים שנרשמו בלי חוב מסוים)')}</span><span className="calc-amt">{money(Math.abs(adjust))}</span></div>
      )}

      <div className="calc-final">
        <div>{net === 0 ? t('מאוזן: אף אחד לא חייב') : iOwe ? g(myGender, 'בסך הכול אני חייב ל{name}', 'בסך הכול אני חייבת ל{name}', 'בסך הכול אני חייב/ת ל{name}', { name: other_ }) : g(other.gender, 'בסך הכול {name} חייב לי', 'בסך הכול {name} חייבת לי', 'בסך הכול {name} חייב/ת לי', { name: other_ })}</div>
        <div className="calc-eq" dir="ltr">
          <bdo dir="ltr">{`${plain(sumTheirs)} − ${plain(sumMine)}${adjust !== 0 ? ` ${adjust > 0 ? '+' : '−'} ${plain(Math.abs(adjust))}` : ''} = `}<strong>{plain(Math.abs(net))}</strong></bdo>
        </div>
      </div>

      {twoSided && (
        <>
          <AsyncButton className="charcoalbtn" onClick={offset}>{t('קיזוז חובות הדדיים ({amount})', { amount: money(overlap) })}</AsyncButton>
          <p className="calc-hint">{t('הקיזוז סוגר חובות משני הצדדים עד {amount}. ההפרש נשאר כמו שהוא וההיסטוריה נשמרת.', { amount: money(overlap) })}</p>
        </>
      )}
      {net !== 0 && (
        <button type="button" className="charcoalbtn" onClick={payNet}>
          {iOwe ? t('שילמתי את ההפרש ({amount})', { amount: money(net) }) : t('קיבלתי את ההפרש ({amount})', { amount: money(-net) })}
        </button>
      )}
    </div>
  );
}
