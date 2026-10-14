import { state, WEEKDAYS } from '../state.js';
import { $, el, money, fmtDate, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';
import { nameOf } from '../computations.js';

// ---------- דמי כיס קבועים (הורים) ----------
const recurringWhen = (r) => (r.frequency === 'weekly' ? `כל יום ${WEEKDAYS[r.weekday]}` : `ב-${r.monthDay} בכל חודש`);

export function renderRecurring() {
  const box = $('recurringList');
  box.replaceChildren();
  if (!state.data.recurring.length) box.append(el('div', { class: 'empty', text: 'עוד אין רישומים קבועים.' }));
  state.data.recurring.forEach((r) => box.append(el('div', { class: 'row' },
    el('div', { class: 'text' },
      el('div', { text: `${nameOf(r.from)} חייב/ת ל${nameOf(r.to)} ${money(r.amount)}` }),
      el('div', { class: 'meta', text: [recurringWhen(r), r.note, 'הרישום הבא: ' + fmtDate(r.nextDate)].filter(Boolean).join(' • ') })),
    el('button', {
      class: 'small danger', type: 'button', text: 'הפסקה', onclick: async () => {
        if (!confirm('להפסיק את הרישום הקבוע? מה שכבר נרשם נשאר.')) return;
        try { await call('recurring:remove', { token: state.token, id: r.id }); toast('הרישום הקבוע הופסק'); }
        catch (err) { toast(errMsg(err)); }
      },
    }))));

  // רשימות הבחירה של הטופס. שומרים על הבחירה הקיימת בין רענונים.
  const fill = (sel, items, fallback) => {
    const prev = sel.value;
    sel.replaceChildren(...items.map(([val, label]) => el('option', { value: val, text: label })));
    sel.value = items.some(([val]) => val === prev) ? prev : fallback;
  };
  const people = state.data.people.map((p) => [p.id, `${p.avatar} ${p.name}`]);
  const firstChild = state.data.people.find((p) => p.role === 'child');
  fill($('recFrom'), people, state.data.me.id);
  fill($('recTo'), people, firstChild ? firstChild.id : (state.data.people.find((p) => p.id !== state.data.me.id) || state.data.me).id);
  if (!$('recWeekday').childElementCount) {
    fill($('recWeekday'), WEEKDAYS.map((d, i) => [String(i), 'יום ' + d]), '5');
    fill($('recMonthDay'), Array.from({ length: 28 }, (_, i) => [String(i + 1), String(i + 1)]), '1');
  }
}

$('recFreq').addEventListener('change', () => {
  const weekly = $('recFreq').value === 'weekly';
  $('recWeekdayField').hidden = !weekly;
  $('recMonthDayField').hidden = weekly;
});

$('recurringForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = $('recError');
  err.hidden = true;
  const agorot = Math.round(parseFloat($('recAmount').value) * 100);
  if (!Number.isFinite(agorot) || agorot <= 0) { err.textContent = 'כתבו סכום גדול מאפס.'; err.hidden = false; return; }
  const freq = $('recFreq').value;
  try {
    await call('recurring:add', {
      token: state.token, from: $('recFrom').value, to: $('recTo').value, amount: agorot, note: $('recNote').value,
      frequency: freq,
      weekday: freq === 'weekly' ? Number($('recWeekday').value) : undefined,
      monthDay: freq === 'monthly' ? Number($('recMonthDay').value) : undefined,
    });
    $('recAmount').value = '';
    toast('הרישום הקבוע נוסף ✅');
  } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
});
