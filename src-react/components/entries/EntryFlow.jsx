import { useEffect, useState } from 'react';
import { state } from '../../state/state.js';
import { t } from '../../i18n/index.js';
import { call } from '../../lib/api.js';
import { today, toast, errMsg } from '../../lib/helpers.js';
import { openDebtsOf, debtLabel, debtLeftText, namesFor, money, moneyWithValue, baseCurrency, convert, totalsByCurrency, hasForeignOpen, draftEntry, pairOwes } from '../../lib/computations.js';
import { useConfirm } from '../shared/Confirm.jsx';
import { CURRENCIES, currencyLabel, currencySymbol } from '../../lib/currencies.js';
import Select from '../shared/Select.jsx';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';

// אשף: חוב חדש / החזר (גרסת React של src/entryFlow.js).
// opts: {kind:'debt'|'payment', from?, to?, suggest?, debtId?, ...}. חסר from או to => בוחרים אדם.
// במצב חברים opts מביא גם entries/people/endpoint/maxEntry/doneToast/returnTab.
export function EntryFlow({ opts }) {
  const { data, fdata, me, isParent, setTab } = useApp();
  const sheet = useSheet();
  const confirm = useConfirm();
  const entries = opts.entries ? opts.entries : data.entries;
  // המטבע הראשי (בין חברים תמיד שקלים). חוב חדש אפשר לרשום במטבע אחר; החזר נרשם במטבע הראשי.
  const display = opts.endpoint ? 'ILS' : baseCurrency();
  const canPickCurrency = opts.kind === 'debt' && !opts.endpoint;
  const [flow, setFlow] = useState(() => start({ from: opts.from || null, to: opts.to || null, amount: (opts.noDebtPick && opts.suggest) ? String(opts.suggest / 100) : '', agorot: 0, note: '', debtId: null, debtRemaining: null, debtName: '', cur: display, debt: null }));
  const { step, st } = flow;
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [step]);

  const lookup = (id) => data.people.find((p) => p.id === id) || (fdata && fdata.people && fdata.people[id]);
  const { nameOf, gw, owesLine, repaidLine } = namesFor(me, lookup);
  const isMe = (id) => id === me;

  const title = opts.kind === 'debt'
    ? (isMe(st.from) ? gw(st.from, 'אני חייב כסף', 'אני חייבת כסף', 'אני חייב/ת כסף') : t('חייבים לי כסף'))
    : (isMe(st.from) ? t('שילמתי') : isMe(st.to) ? t('קיבלתי כסף') : t('רישום החזר'));
  useSheetTitle(title);

  // אחרי שיש שני אנשים: בהחזר בוחרים לאיזה חוב מחזירים (אם יש כמה). אחרת ממשיכים לסכום.
  function afterPeople(s) {
    if (opts.kind !== 'payment' || opts.noDebtPick) return { step: 'amount', st: s };
    const open = openDebtsOf(s.from, s.to, entries, display);
    if (opts.debtId) {
      const hit = open.find((x) => x.debt.id === opts.debtId);
      if (hit) return pickDebt(s, hit);
    }
    if (open.length === 1) return pickDebt(s, open[0]);
    if (open.length > 1) return { step: 'debt', st: s };
    return { step: 'amount', st: s };
  }
  function start(s) {
    return (!s.from || !s.to) ? { step: 'person', st: s } : afterPeople(s);
  }
  function pickDebt(s, x) {
    // debtRemaining = כמה אפשר לשלם במטבע הראשי (חוב במטבע אחר מומר לפי השער של עכשיו).
    return { step: 'amount', st: { ...s, debtId: x.debt.id, debtRemaining: x.foreign ? x.value : x.remaining, debtName: debtLabel(x.debt), debt: x } };
  }
  const patch = (p) => setFlow((f) => ({ ...f, st: { ...f.st, ...p } }));

  if (step === 'person') {
    const fixed = st.from || st.to;
    const others = (opts.people || data.people).filter((p) => p.id !== fixed);
    const q = opts.kind === 'debt'
      ? (isMe(st.from) ? gw(st.from, 'למי אני חייב?', 'למי אני חייבת?', 'למי אני חייב/ת?') : t('מי חייב/ת לי?'))
      : t('עם מי?');
    return (
      <div className="flow">
        <p className="flow-q">{q}</p>
        <div className="tiles">
          {others.map((p) => (
            <button key={p.id} className="tile" type="button"
              onClick={() => setFlow(afterPeople(st.from ? { ...st, to: p.id } : { ...st, from: p.id }))}>
              {p.avatar && <span className="avatar-lg" aria-hidden="true">{p.avatar}</span>}<span className="tname">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'debt') {
    const open = openDebtsOf(st.from, st.to, entries, display);
    return (
      <div className="flow">
        <p className="flow-q">{t('לאיזה חוב ההחזר?')}</p>
        <div className="debt-picks">
          {open.map((x) => (
            <button key={x.debt.id} className="debt-pick" type="button" onClick={() => setFlow(pickDebt(st, x))}>
              <div className="dp-name">{debtLabel(x.debt)}</div>
              <div className="dp-amt">{debtLeftText(x)}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // פונקציות רינדור ולא קומפוננטות, כדי ששדות הקלט לא יתאפסו בכל הקלדה.
  if (step === 'amount') return renderAmount();
  return renderFinal();

  function renderAmount() {
    const meIsFrom = isMe(st.from);
    const other = meIsFrom ? st.to : st.from;
    // סכום מקסימלי להחזר: אם נבחר חוב מסוים, מה שנשאר ממנו. אחרת היתרה הכללית.
    const maxAmount = st.debtRemaining != null ? st.debtRemaining : (opts.kind === 'payment' && opts.suggest ? opts.suggest : null);

    const press = (k) => {
      setErr('');
      let a = st.amount;
      if (k === 'del') a = a.slice(0, -1);
      else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
      else {
        const [i, d] = a.split('.');
        if (d !== undefined ? d.length < 2 : i.length < 5) a = a === '0' ? k : a + k;
      }
      patch({ amount: a });
    };
    const setAmount = (a) => { setErr(''); patch({ amount: a }); };

    const question = opts.kind === 'debt'
      ? (meIsFrom ? gw(st.from, 'כמה אני חייב ל{to}?', 'כמה אני חייבת ל{to}?', 'כמה אני חייב/ת ל{to}?', { to: nameOf(other) })
        : gw(other, 'כמה {name} חייב לי?', 'כמה {name} חייבת לי?', 'כמה {name} חייב/ת לי?', { name: nameOf(other) }))
      : (meIsFrom ? t('כמה שילמתי ל{to}?', { to: nameOf(other) })
        : isMe(st.to) ? gw(other, 'כמה {name} שילם לי?', 'כמה {name} שילמה לי?', 'כמה {name} שילם/ה לי?', { name: nameOf(other) })
          : gw(st.from, 'כמה {from} החזיר ל{to}?', 'כמה {from} החזירה ל{to}?', 'כמה {from} החזיר/ה ל{to}?', { from: nameOf(st.from), to: nameOf(st.to) }));

    const next = () => {
      const agorot = Math.round(parseFloat(st.amount || '0') * 100);
      if (!Number.isFinite(agorot) || agorot <= 0) { setErr(t('כתבו סכום גדול מאפס.')); return; }
      // עד 10,000 ש"ח לרשומה (או השווי שלהם במטבע אחר).
      const ils = convert(agorot, st.cur, 'ILS');
      if ((ils === null ? agorot > 100_000_000 : ils > 1_000_000 * 1.001)) { setErr(t('הסכום גדול מדי.')); return; }
      if (opts.maxEntry && agorot > opts.maxEntry) { setErr(t('בין חברים אפשר לרשום עד {max} בכל פעם.', { max: money(opts.maxEntry, display) })); return; }
      if (maxAmount && agorot > maxAmount) { setErr(st.debtId ? t('נשאר מהחוב הזה {left}.', { left: money(maxAmount, display) }) : t('אפשר להחזיר עד {max}.', { max: money(maxAmount, display) })); return; }
      setFlow({ step: 'final', st: { ...st, agorot } });
    };

    const canPickOther = st.debtId && !opts.debtId && openDebtsOf(st.from, st.to, entries, display).length > 1;
    const sym = currencySymbol(st.cur);
    return (
      <div className="flow">
        <p className="flow-q">{question}</p>
        {st.debtId && <div className="debt-info">{t('על: {debt}', { debt: st.debtName })} • {st.debt ? debtLeftText(st.debt) : money(st.debtRemaining, display)}</div>}
        {st.debt && st.debt.foreign && (
          <div className="debt-info">{t('החוב ב{debtCur}. משלמים ב{payCur} לפי השער של היום.', { debtCur: currencyLabel(st.debt.cur), payCur: currencySymbol(display) })}</div>
        )}
        <div className="amount-display" aria-live="polite">{sym}{st.amount || '0'}</div>
        {canPickCurrency && (
          <div className="field currency-pick"><span>{t('מטבע')}</span>
            <Select value={st.cur} onChange={(c) => patch({ cur: c })}
              options={[display, ...CURRENCIES.filter((c) => c !== display)].map((c) => ({ value: c, label: currencyLabel(c) }))} />
          </div>
        )}
        <div className="chips">
          {[5, 10, 20, 50].map((n) => <button key={n} type="button" className="chip" onClick={() => setAmount(String(n))}>{sym}{n}</button>)}
          {maxAmount ? <button type="button" className="chip strong" onClick={() => setAmount(String(maxAmount / 100))}>{t('הכול {amount}', { amount: money(maxAmount, display) })}</button> : null}
        </div>
        <div className="pad compact">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <button key={k} type="button" className={'key' + (k === 'del' ? ' del' : '')} aria-label={k === 'del' ? t('מחיקה') : k} onClick={() => press(k)}>
              {k === 'del' ? '⌫' : k}
            </button>
          ))}
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="button" className="primary" onClick={next}>{t('המשך')}</button>
        {canPickOther && (
          <button type="button" className="ghost"
            onClick={() => setFlow(afterPeople({ ...st, debtId: null, debtRemaining: null, debt: null }))}>{t('→ בחירת חוב אחר')}</button>
        )}
      </div>
    );
  }

  function renderFinal() {
    const isDebt = opts.kind === 'debt';
    let sentence = `${isDebt ? owesLine(st.from, st.to) : repaidLine(st.from, st.to)} ${isDebt ? moneyWithValue(st.agorot, st.cur, display) : money(st.agorot, display)}`;
    if (st.debtId && st.debt && st.debt.foreign) {
      // החזר על חוב במטבע אחר: כמה מהחוב זה מכסה לפי השער של היום.
      const covers = convert(st.agorot, display, st.debt.cur) ?? 0;
      const left = st.debt.remaining - covers;
      sentence += ' ' + t('על {debt} (= {covers} לפי השער של היום).', { debt: st.debtName, covers: money(Math.round(Math.min(covers, st.debt.remaining)), st.debt.cur) }) + ' '
        + (left >= 1 ? t('יישאר {left} מהחוב.', { left: moneyWithValue(Math.round(left), st.debt.cur, display) }) : t('החוב ייסגר במלואו ✅'));
    } else if (st.debtId) {
      const left = st.debtRemaining - st.agorot;
      sentence += ' ' + t('על {debt}.', { debt: st.debtName }) + ' ' + (left > 0 ? t('יישאר {left} מהחוב.', { left: money(left, display) }) : t('החוב ייסגר במלואו ✅'));
    }
    // מטבע שונה מהמטבע של המשפחה זה מקרה פחות נפוץ: לפני השמירה מציגים התראה מיוחדת
    // עם הסכומים בין שני האנשים מקובצים לפי מטבע, עכשיו ואחרי הפעולה.
    const foreignCase = !opts.endpoint && (isDebt
      ? st.cur !== display
      : (st.debt ? st.debt.foreign : hasForeignOpen(st.from, st.to, entries, display)));

    async function confirmForeign() {
      const after = [...entries, draftEntry({
        kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
        currency: isDebt ? st.cur : display, debtId: st.debtId || undefined,
      })];
      const before = totalsByCurrency(st.from, st.to, entries);
      const next = totalsByCurrency(st.from, st.to, after);
      const curs = [...new Set([...Object.keys(before), ...Object.keys(next)])]
        .sort((a, b) => Number(a === display) - Number(b === display) || a.localeCompare(b));
      /** @type {{ label: string, value: string, strong?: boolean }[]} */
      const rows = curs.map((c) => ({
        label: currencyLabel(c),
        value: `${money(before[c] || 0, c)} ← ${money(next[c] || 0, c)}`,
      }));
      const net0 = Math.max(0, pairOwes(st.from, st.to, entries, display));
      const net1 = Math.max(0, pairOwes(st.from, st.to, after, display));
      rows.push({ label: t('סה״כ ב{cur} לפי השער של היום', { cur: currencySymbol(display) }), value: `${money(net0, display)} ← ${money(net1, display)}`, strong: true });
      return confirm({
        icon: '💱',
        title: isDebt ? t('חוב ב{cur}', { cur: currencyLabel(st.cur) }) : t('תשלום על חוב במטבע אחר'),
        amount: isDebt ? money(st.agorot, st.cur) : money(st.agorot, display),
        message: isDebt
          ? t('המטבע של המשפחה הוא {base}, והחוב הזה יישמר ב{cur}. ביתרות הוא יוצג לפי השער של אותו יום, וכשמשלמים אותו הסכום יומר לפי השער ביום התשלום.', { base: currencyLabel(display), cur: currencyLabel(st.cur) })
          : t('התשלום ב{base} יומר לפי השער של היום ויורד מהחוב במטבע שלו. אחרי השמירה השער הזה נשמר ולא ישתנה.', { base: currencyLabel(display) }),
        rowsTitle: t('{debtLine}, לפי מטבע (עכשיו ← אחרי)', { debtLine: owesLine(st.from, st.to) }),
        rows,
        okText: isDebt ? t('כן, לשמור את החוב') : t('כן, לשמור את התשלום'),
        cancelText: t('חזרה'),
      });
    }

    const save = async () => {
      if (foreignCase && !(await confirmForeign())) return;
      try {
        // entries:add ו-friends:addEntry מקבלות ארגומנטים קצת שונים (המטבע רק בקופה המשפחתית), לכן הארגומנטים כאן דינמיים.
        await call(/** @type {'entries:add'} */ (opts.endpoint || 'entries:add'), /** @type {any} */ ({
          token: state.token, kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
          note: isDebt ? st.note.trim() : (st.note.trim() || t('החזר')), date: today(),
          ...(st.debtId ? { debtId: st.debtId } : {}),
          ...(canPickCurrency ? { currency: st.cur } : {}),
        }));
        sheet.close();
        toast(opts.doneToast || (!isParent ? t('נשלח להורה לאישור ⏳') : isDebt ? t('החוב נשמר ✅') : t('ההחזר נשמר ✅')));
        setTab(opts.returnTab || 'home');
      } catch (e) { setErr(errMsg(e)); }
    };
    return (
      <div className="flow">
        <div className="summary-line">{sentence}</div>
        {isDebt && (
          <>
            <p className="flow-q">{t('על מה? (לא חובה)')}</p>
            <div className="chips">
              {[t('🍦 גלידה'), t('🍬 ממתקים'), t('🎮 משחק'), t('🍕 אוכל')].map((s) => (
                <button key={s} type="button" className="chip" onClick={() => patch({ note: s })}>{s}</button>
              ))}
            </div>
            <input type="text" maxLength={80} placeholder={t('למשל: גלידה, כרטיס לסרט')} value={st.note} onChange={(e) => patch({ note: e.target.value })} />
          </>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <AsyncButton className="primary" onClick={save}>{isDebt ? t('✅ שמירת החוב') : t('✅ שמירת ההחזר')}</AsyncButton>
        <button type="button" className="ghost" onClick={() => setFlow({ step: 'amount', st })}>{t('→ חזרה')}</button>
      </div>
    );
  }
}
