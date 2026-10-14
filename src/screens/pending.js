import { state } from '../state.js';
import { el, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';
import { openSheet, closeSheet } from '../sheet.js';

// כרטיסי "ממתין לאישור" עברו ל-src-react/components/PendingCards.jsx.
// נשאר כאן רק חלון אישור מצב חברים; הוא יעבור ל-React יחד עם sheet.js.

// הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
export function openFriendApprove(p) {
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
