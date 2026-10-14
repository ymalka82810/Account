import { state } from './state.js';
import { el, money, fmtDate, errMsg, toast } from './helpers.js';
import { call } from './api.js';
import { subjectWord, toWord, isPending, debtStates, canDelete, isParent } from './computations.js';

// ---------- רשימות רשומות ----------
export function renderEntries(box, list, emptyText, opts = {}) {
  box.replaceChildren();
  if (!list.length) { box.append(el('div', { class: 'empty', text: emptyText })); return; }
  const debtMap = debtStates(opts.debtList || state.data.entries);
  [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).forEach((e) => {
    const isDebt = e.kind === 'debt';
    const title = `${subjectWord(e.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(e.to)}`;
    // חוב: כמה נשאר ממנו. החזר: על איזה חוב הוא.
    let extra = '';
    const ds = e.debtId || isDebt ? debtMap : null;
    if (ds && isDebt && !isPending(e) && ds.get(e.id) && ds.get(e.id).paid > 0) {
      const st = ds.get(e.id);
      extra = st.remaining > 0 ? `נשאר ${money(st.remaining)} מתוך ${money(e.amount)}` : 'שולם במלואו ✅';
    } else if (ds && !isDebt && e.debtId && ds.get(e.debtId)) {
      extra = 'על: ' + (ds.get(e.debtId).debt.note || 'חוב');
    }
    const row = el('div', { class: 'row' + (isPending(e) ? ' pending' : '') },
      el('div', { class: 'text' },
        el('div', {}, el('span', { class: 'tag ' + e.kind, text: isDebt ? 'חוב' : 'החזר' }),
          isPending(e) ? el('span', { class: 'tag pending', text: opts.pendingLabel ? opts.pendingLabel(e) : '⏳ ממתין לאישור' }) : null, ' ', title),
        el('div', { class: 'meta', text: [fmtDate(e.date), e.note, extra].filter(Boolean).join(' • ') })),
      el('strong', { text: money(e.amount) }));
    if (canDelete(e)) {
      row.append(el('button', {
        class: 'small danger', type: 'button', text: isParent() ? 'מחיקה' : 'ביטול',
        onclick: async () => {
          if (!confirm(isParent() ? 'למחוק את הרשומה הזאת?' : 'לבטל את מה שרשמת?')) return;
          try { await call(opts.removeEndpoint || 'entries:remove', { token: state.token, id: e.id }); toast('הרשומה נמחקה'); }
          catch (err) { toast(errMsg(err)); }
        },
      }));
    }
    box.append(row);
  });
}
