import { state } from '../state.js';
import { $, el, money } from '../helpers.js';
import { pairOwes, openDebtsOf, debtLabel } from '../computations.js';
import { openEntryFlow } from '../entryFlow.js';

// ---------- מסך הבית ----------
export function renderHome() {
  const me = state.data.me.id;
  let owe = 0, get = 0;
  const cards = [];
  for (const p of state.data.people) {
    if (p.id === me) continue;
    const n = pairOwes(me, p.id);
    if (n === 0) continue;
    const iOwe = n > 0;
    const amount = Math.abs(n);
    if (iOwe) owe += amount; else get += amount;
    // החובות הפתוחים בכיוון הזה, כל אחד עם מה שנשאר ממנו וכפתור החזר משלו.
    const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
    const open = openDebtsOf(dFrom, dTo);
    const lines = open.map((x) => el('div', { class: 'debt-line' },
      el('div', { class: 'dl-text' },
        el('div', { class: 'dl-name', text: debtLabel(x.debt) }),
        el('div', { class: 'dl-rem', text: x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining) })),
      el('button', {
        class: 'small', type: 'button', text: iOwe ? 'שילמתי' : 'קיבלתי',
        onclick: () => openEntryFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id }),
      })));
    cards.push(el('div', { class: 'debt ' + (iOwe ? 'owe' : 'get') + (lines.length > 1 ? ' multi' : '') },
      el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
      el('div', { class: 'text' },
        el('div', { class: 'who', text: iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי` }),
        el('div', { class: 'amt', text: money(amount) }),
        lines.length > 1 ? el('div', { class: 'debt-lines' }, lines) : null),
      el('button', {
        class: 'small strongbtn', type: 'button', text: iOwe ? '💰 שילמתי' : '💰 קיבלתי',
        onclick: () => openEntryFlow(iOwe
          ? { kind: 'payment', from: me, to: p.id, suggest: amount }
          : { kind: 'payment', from: p.id, to: me, suggest: amount }),
      })));
  }
  $('sumOwe').textContent = money(owe);
  $('sumGet').textContent = money(get);
  const box = $('myDebts');
  box.replaceChildren();
  if (state.data.people.length < 2) {
    box.append(el('div', { class: 'empty', text: 'עוד אין אף אחד אחר במשפחה. הורה צריך להוסיף אותם.' }));
  } else if (!cards.length) {
    box.append(el('div', { class: 'empty' }, el('div', { class: 'big-emoji', text: '🎉', 'aria-hidden': 'true' }), 'אף אחד לא חייב כלום!'));
  } else cards.forEach((c) => box.append(c));
}
