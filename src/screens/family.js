import { state } from '../state.js';
import { $, el, money, today, errMsg, toast, fmtDate } from '../helpers.js';
import { call } from '../api.js';
import { openDebts, nameOf, roleLabel } from '../computations.js';
import { openEntryFlow } from '../entryFlow.js';
import { renderEntries } from '../entriesList.js';
import { openResetPin } from './emailAuth.js';
import { renderRecurring } from './recurring.js';
import { renderCodes } from './codes.js';
import { renderLegacy } from './legacy.js';

// ---------- לשונית המשפחה (הורים) ----------
export function renderFamily() {
  const bal = new Map(state.data.people.map((p) => [p.id, 0]));
  const debts = openDebts();
  debts.forEach((d) => {
    bal.set(d.creditor, bal.get(d.creditor) + d.amount);
    bal.set(d.debtor, bal.get(d.debtor) - d.amount);
  });
  $('balances').replaceChildren(...state.data.people.map((p) => {
    const v = bal.get(p.id) || 0;
    return el('div', { class: 'bal ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero') },
      el('div', { class: 'name', text: `${p.avatar} ${p.name}` }),
      el('div', { class: 'num', text: money(Math.abs(v)) }),
      el('div', { class: 'what', text: v > 0 ? 'מגיע לו/ה' : v < 0 ? 'חייב/ת' : 'הכול מסודר' }));
  }));

  const dbox = $('debts');
  dbox.replaceChildren();
  if (!debts.length) dbox.append(el('div', { class: 'empty', text: 'אף אחד לא חייב כלום.' }));
  debts.forEach((d) => dbox.append(el('div', { class: 'debt' },
    el('div', { class: 'text' },
      el('div', { class: 'who', text: `${nameOf(d.debtor)} חייב/ת ל${nameOf(d.creditor)}` }),
      el('div', { class: 'amt', text: money(d.amount) })),
    el('button', {
      class: 'small', type: 'button', text: 'החזר חלקי',
      onclick: () => openEntryFlow({ kind: 'payment', from: d.debtor, to: d.creditor, suggest: d.amount }),
    }),
    el('button', {
      class: 'small', type: 'button', text: 'שולם הכול', onclick: async () => {
        if (!confirm(`${nameOf(d.debtor)} סגר/ה את כל החוב (${money(d.amount)})?`)) return;
        try {
          await call('entries:add', { token: state.token, kind: 'payment', from: d.debtor, to: d.creditor, amount: d.amount, note: 'סגירת חוב', date: today() });
          toast('החוב נסגר ✅');
        } catch (e) { toast(errMsg(e)); }
      },
    }))));

  $('peopleList').replaceChildren(...state.data.people.map((p) => el('div', { class: 'person' },
    el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
    el('div', { class: 'text' }, p.name, ' ',
      el('span', { class: 'meta', text: roleLabel(p.role) + (p.hasPin ? '' : ' • עוד לא בחר/ה קוד') }),
      p.lockAlert ? el('div', { class: 'meta', style: 'color:#b45309', text: `⚠️ הקוד של ${p.name} ננעל ${p.lockAlert.count === 1 ? 'פעם אחת' : p.lockAlert.count + ' פעמים'} אחרי ניסיונות שגויים. אם זה לא הוא/היא, כדאי לקבוע קוד חדש.` }) : null,
      p.role === 'teen' && p.friendsEnabled ? el('div', { class: 'meta', text: `🤝 מצב חברים פעיל • ${p.friendEmail || ''}` }) : null),
    el('button', { class: 'small', type: 'button', text: 'קוד חדש', onclick: () => openResetPin(p) }),
    p.role === 'parent' ? null : el('button', {
      class: 'small', type: 'button', text: p.role === 'teen' ? 'חזרה לילד/ה' : 'הפיכה לנער/ה',
      onclick: async () => {
        const toRole = p.role === 'teen' ? 'child' : 'teen';
        if (toRole === 'child' && p.friendsEnabled && !confirm(`${p.name} יאבד/תאבד את מצב החברים. להמשיך?`)) return;
        try { await call('people:setRole', { token: state.token, id: p.id, role: toRole }); toast(toRole === 'teen' ? `${p.name} עכשיו נער/ה` : `${p.name} עכשיו ילד/ה`); }
        catch (e) { toast(errMsg(e)); }
      },
    }),
    p.role === 'teen' && p.friendsEnabled ? el('button', {
      class: 'small danger', type: 'button', text: 'כיבוי חברים',
      onclick: async () => {
        if (!confirm(`לכבות את מצב החברים של ${p.name}? אי אפשר יהיה להוסיף רישומים חדשים עם חברים.`)) return;
        try { await call('friends:disableAccess', { token: state.token, personId: p.id }); toast('מצב חברים כובה'); }
        catch (e) { toast(errMsg(e)); }
      },
    }) : null,

    p.id === state.data.me.id ? null : el('button', {
      class: 'small danger', type: 'button', text: 'הסרה', 'aria-label': 'הסרת ' + p.name,
      onclick: async () => {
        if (!confirm(`להסיר את ${p.name} מהמשפחה?`)) return;
        try { await call('people:remove', { token: state.token, id: p.id }); toast(`${p.name} הוסר/ה`); }
        catch (e) { toast(errMsg(e)); }
      },
    }))));

  renderEntries($('allHistory'), state.data.entries, 'עדיין אין רשומות.');
  renderTeenOverview();
  renderRecurring();
  renderCodes();
  renderLegacy();
}

// ---------- סקירה להורים: מה הנוער רושם עם חברים ----------
function renderTeenOverview() {
  const teens = state.fdata && state.fdata.kind === 'parent' ? state.fdata.teens : [];
  $('teenFriendsSection').hidden = teens.length === 0;
  $('teenFriendsBox').replaceChildren(...teens.map((t) => el('div', { class: 'card teen-card' },
    el('h3', { text: `🤝 ${t.name}` }),
    el('div', { class: 'meta', text: t.friends.length ? 'חברים: ' + t.friends.join(', ') : 'עוד אין חברים מאושרים' }),
    ...(t.entries.length ? t.entries.map((e) => el('div', { class: 'row' },
      el('div', { class: 'text' },
        el('div', {},
          el('span', { class: 'tag ' + e.kind, text: e.kind === 'debt' ? 'חוב' : 'החזר' }),
          e.status === 'pending' ? el('span', { class: 'tag pending', text: '⏳ ממתין לחבר/ה' }) : null,
          ' ', `${e.fromName} ${e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ל${e.toName}`),
        el('div', { class: 'meta', text: [fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
      el('strong', { text: money(e.amount) })))
      : [el('div', { class: 'empty', text: 'עוד לא נרשם כלום.' })]))));
}

