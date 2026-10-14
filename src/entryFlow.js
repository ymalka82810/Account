import { state } from './state.js';
import { $, el, money, today, errMsg, toast } from './helpers.js';
import { call } from './api.js';
import { isMe, isParent, nameOf, subjectWord, toWord, openDebtsOf, debtLabel } from './computations.js';
import { openSheet, closeSheet } from './sheet.js';
import { switchTab } from './tabs.js';

// ---------- אשף: חוב חדש / החזר ----------
// opts: {kind:'debt'|'payment', from?, to?, suggest?}  (חסר from או to => בוחרים אדם)
export function openEntryFlow(opts) {
  const st = { from: opts.from || null, to: opts.to || null, amount: '', agorot: 0, note: '', debtId: null, debtRemaining: null, debtName: '' };
  const body = el('div', { class: 'flow' });
  // סכום מקסימלי להחזר: אם נבחר חוב מסוים, מה שנשאר ממנו. אחרת היתרה הכללית.
  const maxFor = () => (st.debtRemaining != null ? st.debtRemaining : (opts.kind === 'payment' && opts.suggest ? opts.suggest : null));
  let opened = false;

  const titleFor = () => {
    if (opts.kind === 'debt') return isMe(st.from) ? 'אני חייב/ת כסף' : 'חייבים לי כסף';
    return isMe(st.from) ? 'שילמתי' : isMe(st.to) ? 'קיבלתי כסף' : 'רישום החזר';
  };

  const entriesNow = () => (opts.entries ? opts.entries() : state.data.entries);
  const pickDebt = (x) => {
    st.debtId = x.debt.id; st.debtRemaining = x.remaining; st.debtName = debtLabel(x.debt);
    stepAmount();
  };

  // אחרי שיש שני אנשים: בהחזר בוחרים לאיזה חוב מחזירים (אם יש כמה). אחרת ממשיכים לסכום.
  function afterPeople() {
    if (opts.kind !== 'payment' || opts.noDebtPick) return stepAmount();
    if (opts.debtId) {
      const hit = openDebtsOf(st.from, st.to, entriesNow()).find((x) => x.debt.id === opts.debtId);
      if (hit) return pickDebt(hit);
    }
    const open = openDebtsOf(st.from, st.to, entriesNow());
    if (open.length === 1) return pickDebt(open[0]);
    if (open.length > 1) return stepDebt(open);
    return stepAmount();
  }

  function stepDebt(open) {
    body.replaceChildren(
      el('p', { class: 'flow-q', text: 'לאיזה חוב ההחזר?' }),
      el('div', { class: 'debt-picks' }, open.map((x) => el('button', {
        class: 'debt-pick', type: 'button', onclick: () => pickDebt(x),
      },
      el('div', { class: 'dp-name', text: debtLabel(x.debt) }),
      el('div', { class: 'dp-amt', text: x.paid > 0
        ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}`
        : money(x.remaining) })))),
    );
    openOrUpdate();
  }

  function openOrUpdate() {
    if (opened) { $('sheetTitle').textContent = titleFor(); return; }
    opened = true;
    openSheet(titleFor(), body);
  }

  function stepPerson() {
    const fixed = st.from || st.to;
    const others = (opts.people || state.data.people).filter((p) => p.id !== fixed);
    const q = opts.kind === 'debt'
      ? (isMe(st.from) ? 'למי אני חייב/ת?' : 'מי חייב/ת לי?')
      : 'עם מי?';
    body.replaceChildren(
      el('p', { class: 'flow-q', text: q }),
      el('div', { class: 'tiles' }, others.map((p) => el('button', {
        class: 'tile', type: 'button',
        onclick: () => { if (st.from) st.to = p.id; else st.from = p.id; afterPeople(); },
      }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name })))),
    );
    openOrUpdate();
  }

  function stepAmount() {
    const meIsFrom = isMe(st.from);
    const other = meIsFrom ? st.to : st.from;
    const disp = el('div', { class: 'amount-display', 'aria-live': 'polite' });
    const err = el('p', { class: 'error', role: 'alert' });
    const refresh = () => { disp.textContent = '₪' + (st.amount || '0'); };

    const press = (k) => {
      err.textContent = '';
      let a = st.amount;
      if (k === 'del') a = a.slice(0, -1);
      else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
      else {
        const [i, d] = a.split('.');
        if (d !== undefined ? d.length < 2 : i.length < 5) a = a === '0' ? k : a + k;
      }
      st.amount = a;
      refresh();
    };

    const chips = [5, 10, 20, 50].map((n) => el('button', {
      type: 'button', class: 'chip', text: '₪' + n,
      onclick: () => { st.amount = String(n); err.textContent = ''; refresh(); },
    }));
    const maxAmount = maxFor();
    if (maxAmount) {
      chips.push(el('button', {
        type: 'button', class: 'chip strong', text: 'הכול ' + money(maxAmount),
        onclick: () => { st.amount = String(maxAmount / 100); err.textContent = ''; refresh(); },
      }));
    }

    const pad = el('div', { class: 'pad compact' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => el('button', {
        type: 'button', class: 'key' + (k === 'del' ? ' del' : ''), 'aria-label': k === 'del' ? 'מחיקה' : k,
        text: k === 'del' ? '⌫' : k, onclick: () => press(k),
      })));

    const question = opts.kind === 'debt'
      ? (meIsFrom ? `כמה אני חייב/ת ${toWord(other)}?` : `כמה ${nameOf(other)} חייב/ת לי?`)
      : (meIsFrom ? `כמה שילמתי ${toWord(other)}?`
        : isMe(st.to) ? `כמה ${nameOf(other)} שילם/ה לי?`
          : `כמה ${nameOf(st.from)} החזיר/ה ל${nameOf(st.to)}?`);

    const next = el('button', {
      type: 'button', class: 'primary', text: 'המשך', onclick: () => {
        const agorot = Math.round(parseFloat(st.amount || '0') * 100);
        if (!Number.isFinite(agorot) || agorot <= 0) { err.textContent = 'כתבו סכום גדול מאפס.'; return; }
        if (agorot > 1_000_000) { err.textContent = 'הסכום גדול מדי.'; return; }
        if (opts.maxEntry && agorot > opts.maxEntry) { err.textContent = `בין חברים אפשר לרשום עד ${money(opts.maxEntry)} בכל פעם.`; return; }
        if (maxAmount && agorot > maxAmount) { err.textContent = st.debtId ? `נשאר מהחוב הזה ${money(maxAmount)}.` : `אפשר להחזיר עד ${money(maxAmount)}.`; return; }
        st.agorot = agorot;
        stepFinal();
      },
    });

    const debtInfo = st.debtId
      ? el('div', { class: 'debt-info', text: `על: ${st.debtName} • נשאר ${money(st.debtRemaining)}` })
      : null;
    const backToDebt = st.debtId && !opts.debtId && openDebtsOf(st.from, st.to, entriesNow()).length > 1
      ? el('button', { type: 'button', class: 'ghost', text: '→ בחירת חוב אחר', onclick: () => { st.debtId = null; st.debtRemaining = null; afterPeople(); } })
      : null;
    body.replaceChildren(
      el('p', { class: 'flow-q', text: question }), debtInfo, disp, el('div', { class: 'chips' }, chips), pad, err, next, backToDebt);
    refresh();
    openOrUpdate();
  }

  function stepFinal() {
    const isDebt = opts.kind === 'debt';
    const noteInput = el('input', { type: 'text', maxlength: '80', placeholder: 'למשל: גלידה, כרטיס לסרט' });
    noteInput.value = st.note;
    noteInput.addEventListener('input', () => { st.note = noteInput.value; });
    const err = el('p', { class: 'error', role: 'alert' });

    let sentence = `${subjectWord(st.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(st.to)} ${money(st.agorot)}`;
    if (st.debtId) {
      const left = st.debtRemaining - st.agorot;
      sentence += ` על ${st.debtName}. ` + (left > 0 ? `יישאר ${money(left)} מהחוב.` : 'החוב ייסגר במלואו ✅');
    }

    const saveBtn = el('button', { type: 'button', class: 'primary', text: isDebt ? '✅ שמירת החוב' : '✅ שמירת ההחזר' });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await call(opts.endpoint || 'entries:add', {
          token: state.token, kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
          note: isDebt ? st.note.trim() : (st.note.trim() || 'החזר'), date: today(),
          ...(st.debtId ? { debtId: st.debtId } : {}),
        });
        closeSheet();
        toast(opts.doneToast || (!isParent() ? 'נשלח להורה לאישור ⏳' : isDebt ? 'החוב נשמר ✅' : 'ההחזר נשמר ✅'));
        switchTab(opts.returnTab || 'home');
      } catch (e) { err.textContent = errMsg(e); saveBtn.disabled = false; }
    });

    const parts = [el('div', { class: 'summary-line', text: sentence })];
    if (isDebt) {
      parts.push(
        el('p', { class: 'flow-q', text: 'על מה? (לא חובה)' }),
        el('div', { class: 'chips' }, ['🍦 גלידה', '🍬 ממתקים', '🎮 משחק', '🍕 אוכל'].map((t) => el('button', {
          type: 'button', class: 'chip', text: t, onclick: () => { noteInput.value = t; st.note = t; },
        }))),
        noteInput,
      );
    }
    parts.push(err, saveBtn, el('button', { type: 'button', class: 'ghost', text: '→ חזרה', onclick: stepAmount }));
    body.replaceChildren(...parts);
    openOrUpdate();
  }

  if (!st.from || !st.to) stepPerson(); else afterPeople();
}
