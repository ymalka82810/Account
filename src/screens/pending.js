import { state } from '../state.js';
import { $, el, money, fmtDate, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';
import { isParent, nameOf, isPending, friendRequests, teenRequests } from '../computations.js';
import { openSheet, closeSheet } from '../sheet.js';

// ---------- ממתין לאישור ----------
export function renderPending() {
  const parentView = isParent();
  // להורים האישורים בראש הסקירה המשפחתית. לאחרים, בדף הבית.
  const box = parentView ? $('pendingBoxParent') : $('pendingBox');
  (parentView ? $('pendingBox') : $('pendingBoxParent')).replaceChildren();
  box.replaceChildren();
  const list = state.data.entries.filter(isPending);
  if (!parentView) {
    if (!list.length) return;
    box.append(el('div', { class: 'card notice' },
      el('p', { text: `⏳ ${list.length === 1 ? 'רישום אחד מחכה' : list.length + ' רישומים מחכים'} לאישור של הורה. אפשר לראות אותם ב"מה היה".` })));
    return;
  }

  const teenReqs = teenRequests();
  if (teenReqs.length) {
    const tcard = el('div', { class: 'card pending-card' }, el('h3', { text: `🎧 בקשות לעבור לנוער (${teenReqs.length})` }));
    teenReqs.forEach((p) => tcard.append(el('div', { class: 'row' },
      el('div', { class: 'text' },
        el('div', { text: `${p.name} מבקש/ת להפוך לנער/ה` }),
        el('div', { class: 'meta', text: 'ממשק מותאם לנוער. מצב חברים נפרד ודורש אישור נוסף.' })),
      el('div', { class: 'acts' },
        el('button', {
          class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
            try { await call('people:setRole', { token: state.token, id: p.id, role: 'teen' }); toast(`${p.name} עכשיו נער/ה`); }
            catch (err) { toast(errMsg(err)); }
          },
        }),
        el('button', {
          class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
            try { await call('people:declineTeen', { token: state.token, id: p.id }); toast('הבקשה נדחתה'); }
            catch (err) { toast(errMsg(err)); }
          },
        })))));
    box.append(tcard);
  }

  const reqs = friendRequests();
  if (reqs.length) {
    const card = el('div', { class: 'card pending-card' }, el('h3', { text: `🤝 בקשות למצב חברים (${reqs.length})` }));
    reqs.forEach((p) => card.append(el('div', { class: 'row' },
      el('div', { class: 'text' },
        el('div', { text: `${p.name} מבקש/ת לרשום חובות עם חברים` }),
        el('div', { class: 'meta', text: 'חברים נוספים לפי כתובת מייל. תראו כל מה שנרשם בסקירה.' })),
      el('div', { class: 'acts' },
        el('button', { class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: () => openFriendApprove(p) }),
        el('button', {
          class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
            try { await call('friends:declineAccess', { token: state.token, personId: p.id }); toast('הבקשה נדחתה'); }
            catch (err) { toast(errMsg(err)); }
          },
        })))));
    box.append(card);
  }

  if (!list.length) return;
  const card = el('div', { class: 'card pending-card' }, el('h3', { text: `⏳ ממתין לאישור (${list.length})` }));
  [...list].sort((x, y) => x.createdAt - y.createdAt).forEach((e) => {
    const isDebt = e.kind === 'debt';
    const who = e.createdBy ? nameOf(e.createdBy) : 'מישהו';
    card.append(el('div', { class: 'row' },
      el('div', { class: 'text' },
        el('div', { text: `${who} רשם/ה: ${nameOf(e.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ל${nameOf(e.to)}` }),
        el('div', { class: 'meta', text: [money(e.amount), fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
      el('div', { class: 'acts' },
        el('button', {
          class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
            try { await call('entries:approve', { token: state.token, id: e.id }); toast('אושר ✅'); }
            catch (err) { toast(errMsg(err)); }
          },
        }),
        el('button', {
          class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
            if (!confirm('לדחות? הרישום יימחק.')) return;
            try { await call('entries:reject', { token: state.token, id: e.id }); toast('הרישום נדחה'); }
            catch (err) { toast(errMsg(err)); }
          },
        }))));
  });
  box.append(card);
}

// הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
function openFriendApprove(p) {
  const email = el('input', { type: 'email', dir: 'ltr', autocomplete: 'off', placeholder: 'name@example.com', maxlength: '254' });
  email.value = p.friendEmail || '';
  const err = el('p', { class: 'error', role: 'alert' });
  openSheet('מצב חברים ל' + p.name, el('div', { class: 'form' },
    el('p', { class: 'hint', text: `${p.name} יוכל/תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.` }),
    el('label', { class: 'field' }, el('span', { text: `המייל של ${p.name}` }), email),
    el('p', { class: 'hint', text: 'חברים מוסיפים את הנער/ה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.' }),
    err,
    el('button', {
      class: 'primary', type: 'button', text: 'אישור מצב חברים', onclick: async () => {
        try {
          await call('friends:approveAccess', { token: state.token, personId: p.id, email: email.value });
          closeSheet();
          toast('מצב חברים אושר ✅');
        } catch (e) { err.textContent = errMsg(e); }
      },
    })));
}
