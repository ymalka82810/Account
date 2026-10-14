import { useEffect, useState } from 'react';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { today, toast, errMsg } from '../../lib/helpers.js';
import { openDebtsOf, debtLabel, namesFor, money } from '../../lib/computations.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';

// אשף: חוב חדש / החזר (גרסת React של src/entryFlow.js).
// opts: {kind:'debt'|'payment', from?, to?, suggest?, debtId?, ...}. חסר from או to => בוחרים אדם.
// במצב חברים opts מביא גם entries/people/endpoint/maxEntry/doneToast/returnTab.
export function EntryFlow({ opts }) {
  const { data, fdata, me, isParent, setTab } = useApp();
  const sheet = useSheet();
  const entries = opts.entries ? opts.entries : data.entries;
  const [flow, setFlow] = useState(() => start({ from: opts.from || null, to: opts.to || null, amount: '', agorot: 0, note: '', debtId: null, debtRemaining: null, debtName: '' }));
  const { step, st } = flow;
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [step]);

  const lookup = (id) => data.people.find((p) => p.id === id) || (fdata && fdata.people && fdata.people[id]);
  const { nameOf, subjectWord, toWord, gw } = namesFor(me, lookup);
  const isMe = (id) => id === me;

  const title = opts.kind === 'debt'
    ? (isMe(st.from) ? gw(st.from, 'אני חייב כסף', 'אני חייבת כסף', 'אני חייב/ת כסף') : 'חייבים לי כסף')
    : (isMe(st.from) ? 'שילמתי' : isMe(st.to) ? 'קיבלתי כסף' : 'רישום החזר');
  useSheetTitle(title);

  // אחרי שיש שני אנשים: בהחזר בוחרים לאיזה חוב מחזירים (אם יש כמה). אחרת ממשיכים לסכום.
  function afterPeople(s) {
    if (opts.kind !== 'payment' || opts.noDebtPick) return { step: 'amount', st: s };
    const open = openDebtsOf(s.from, s.to, entries);
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
    return { step: 'amount', st: { ...s, debtId: x.debt.id, debtRemaining: x.remaining, debtName: debtLabel(x.debt) } };
  }
  const patch = (p) => setFlow((f) => ({ ...f, st: { ...f.st, ...p } }));

  if (step === 'person') {
    const fixed = st.from || st.to;
    const others = (opts.people || data.people).filter((p) => p.id !== fixed);
    const q = opts.kind === 'debt'
      ? (isMe(st.from) ? gw(st.from, 'למי אני חייב?', 'למי אני חייבת?', 'למי אני חייב/ת?') : 'מי חייב/ת לי?')
      : 'עם מי?';
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
    const open = openDebtsOf(st.from, st.to, entries);
    return (
      <div className="flow">
        <p className="flow-q">לאיזה חוב ההחזר?</p>
        <div className="debt-picks">
          {open.map((x) => (
            <button key={x.debt.id} className="debt-pick" type="button" onClick={() => setFlow(pickDebt(st, x))}>
              <div className="dp-name">{debtLabel(x.debt)}</div>
              <div className="dp-amt">{x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining)}</div>
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
      ? (meIsFrom ? `כמה ${gw(st.from, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} ${toWord(other)}?`
        : `כמה ${nameOf(other)} ${gw(other, 'חייב', 'חייבת', 'חייב/ת')} לי?`)
      : (meIsFrom ? `כמה שילמתי ${toWord(other)}?`
        : isMe(st.to) ? `כמה ${nameOf(other)} ${gw(other, 'שילם', 'שילמה', 'שילם/ה')} לי?`
          : `כמה ${nameOf(st.from)} ${gw(st.from, 'החזיר', 'החזירה', 'החזיר/ה')} ל${nameOf(st.to)}?`);

    const next = () => {
      const agorot = Math.round(parseFloat(st.amount || '0') * 100);
      if (!Number.isFinite(agorot) || agorot <= 0) { setErr('כתבו סכום גדול מאפס.'); return; }
      if (agorot > 1_000_000) { setErr('הסכום גדול מדי.'); return; }
      if (opts.maxEntry && agorot > opts.maxEntry) { setErr(`בין חברים אפשר לרשום עד ${money(opts.maxEntry)} בכל פעם.`); return; }
      if (maxAmount && agorot > maxAmount) { setErr(st.debtId ? `נשאר מהחוב הזה ${money(maxAmount)}.` : `אפשר להחזיר עד ${money(maxAmount)}.`); return; }
      setFlow({ step: 'final', st: { ...st, agorot } });
    };

    const canPickOther = st.debtId && !opts.debtId && openDebtsOf(st.from, st.to, entries).length > 1;
    return (
      <div className="flow">
        <p className="flow-q">{question}</p>
        {st.debtId && <div className="debt-info">על: {st.debtName} • נשאר {money(st.debtRemaining)}</div>}
        <div className="amount-display" aria-live="polite">₪{st.amount || '0'}</div>
        <div className="chips">
          {[5, 10, 20, 50].map((n) => <button key={n} type="button" className="chip" onClick={() => setAmount(String(n))}>₪{n}</button>)}
          {maxAmount ? <button type="button" className="chip strong" onClick={() => setAmount(String(maxAmount / 100))}>הכול {money(maxAmount)}</button> : null}
        </div>
        <div className="pad compact">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <button key={k} type="button" className={'key' + (k === 'del' ? ' del' : '')} aria-label={k === 'del' ? 'מחיקה' : k} onClick={() => press(k)}>
              {k === 'del' ? '⌫' : k}
            </button>
          ))}
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="button" className="primary" onClick={next}>המשך</button>
        {canPickOther && (
          <button type="button" className="ghost"
            onClick={() => setFlow(afterPeople({ ...st, debtId: null, debtRemaining: null }))}>→ בחירת חוב אחר</button>
        )}
      </div>
    );
  }

  function renderFinal() {
    const isDebt = opts.kind === 'debt';
    let sentence = `${subjectWord(st.from)} ${isDebt ? gw(st.from, 'חייב', 'חייבת', 'חייב/ת') : gw(st.from, 'החזיר', 'החזירה', 'החזיר/ה')} ${toWord(st.to)} ${money(st.agorot)}`;
    if (st.debtId) {
      const left = st.debtRemaining - st.agorot;
      sentence += ` על ${st.debtName}. ` + (left > 0 ? `יישאר ${money(left)} מהחוב.` : 'החוב ייסגר במלואו ✅');
    }
    const save = async () => {
      try {
        await call(opts.endpoint || 'entries:add', {
          token: state.token, kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
          note: isDebt ? st.note.trim() : (st.note.trim() || 'החזר'), date: today(),
          ...(st.debtId ? { debtId: st.debtId } : {}),
        });
        sheet.close();
        toast(opts.doneToast || (!isParent ? 'נשלח להורה לאישור ⏳' : isDebt ? 'החוב נשמר ✅' : 'ההחזר נשמר ✅'));
        setTab(opts.returnTab || 'home');
      } catch (e) { setErr(errMsg(e)); }
    };
    return (
      <div className="flow">
        <div className="summary-line">{sentence}</div>
        {isDebt && (
          <>
            <p className="flow-q">על מה? (לא חובה)</p>
            <div className="chips">
              {['🍦 גלידה', '🍬 ממתקים', '🎮 משחק', '🍕 אוכל'].map((t) => (
                <button key={t} type="button" className="chip" onClick={() => patch({ note: t })}>{t}</button>
              ))}
            </div>
            <input type="text" maxLength={80} placeholder="למשל: גלידה, כרטיס לסרט" value={st.note} onChange={(e) => patch({ note: e.target.value })} />
          </>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <AsyncButton className="primary" onClick={save}>{isDebt ? '✅ שמירת החוב' : '✅ שמירת ההחזר'}</AsyncButton>
        <button type="button" className="ghost" onClick={() => setFlow({ step: 'amount', st })}>→ חזרה</button>
      </div>
    );
  }
}
