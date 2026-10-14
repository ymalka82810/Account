import { state } from '../state.js';
import { el, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';
import { openSheet, closeSheet } from '../sheet.js';

// ---------- אימות במייל ----------
export const codeField = () => el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '6 ספרות', dir: 'ltr' });
export const pinField = (ac) => el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: ac });

// הוספה או החלפה של מייל להורה: כתובת, ואז קוד אימות שנשלח אליה.
export function openEmailSheet() {
  const current = state.data.me.email;
  const stepCode = (addr) => {
    const code = codeField();
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('אימות המייל', el('div', { class: 'form' },
      el('p', { class: 'hint', text: `שלחנו קוד בן 6 ספרות אל ${addr}. הוא תקף ל-10 דקות.` }),
      el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), code),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'אימות', onclick: async () => {
          try {
            const res = await call('emailAuth:confirmEmail', { token: state.token, code: code.value });
            if (res.ok) { closeSheet(); toast('המייל אומת ✅'); }
            else err.textContent = 'הקוד שגוי או שפג תוקפו.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      }),
      el('button', { class: 'ghost', type: 'button', text: 'כתובת אחרת', onclick: start })));
  };
  // כתובת חדשה. אם כבר יש מייל מאומת, צריך גם את הקוד שנשלח למייל הישן.
  const stepEmail = () => {
    const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'name@example.com', dir: 'ltr' });
    const oldCode = current ? codeField() : null;
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('מייל לשחזור הקוד', el('div', { class: 'form' },
      el('p', { class: 'hint', text: current
        ? `שלחנו קוד אל ${current}. כתבו אותו, ואת הכתובת החדשה. היא תחליף את הנוכחית רק אחרי אימות.`
        : 'נשלח אליו קוד כשמשנים או מאפסים קוד סודי, וגם התראה כשהקוד של מישהו במשפחה ננעל.' }),
      oldCode ? el('label', { class: 'field' }, el('span', { text: 'קוד מהמייל הנוכחי' }), oldCode) : null,
      el('label', { class: 'field' }, el('span', { text: 'כתובת מייל' + (current ? ' חדשה' : '') }), email),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שליחת קוד אימות', onclick: async () => {
          err.textContent = '';
          try {
            const res = await call('emailAuth:requestVerify', { token: state.token, email: email.value, oldCode: oldCode ? oldCode.value : undefined });
            if (res.ok) stepCode(email.value.trim().toLowerCase());
            else err.textContent = 'הקוד מהמייל הנוכחי שגוי או שפג תוקפו.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  };
  // נקודת ההתחלה: בלי מייל, ישר לכתובת. עם מייל מאומת, קודם שולחים קוד למייל הישן.
  function start() {
    if (!current) { stepEmail(); return; }
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('החלפת מייל', el('div', { class: 'form' },
      el('p', { class: 'hint', text: `המייל הנוכחי: ${current}. להחלפה נשלח אליו קוד אישור.` }),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שליחת קוד למייל הנוכחי', onclick: async () => {
          try { await call('emailAuth:requestEmailChangeCode', { token: state.token }); stepEmail(); }
          catch (e) { err.textContent = errMsg(e); }
        },
      })));
  }
  start();
}

// שינוי הקוד הסודי של הורה עם מייל מאומת: קוד מהמייל במקום הקוד הנוכחי.
export function openChangePinEmail() {
  const stepForm = () => {
    const code = codeField();
    const newPin = pinField('new-password');
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
      el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), code),
      el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שמירה', onclick: async () => {
          if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
          try {
            const res = await call('emailAuth:changePinWithCode', { token: state.token, code: code.value, newPin: newPin.value });
            if (res.ok) { closeSheet(); toast('הקוד שונה ✅'); }
            else err.textContent = 'קוד האימות שגוי או שפג תוקפו.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  };
  const err = el('p', { class: 'error', role: 'alert' });
  openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
    el('p', { class: 'hint', text: `לאישור נשלח קוד אימות ל-${state.data.me.email}.` }),
    err,
    el('button', {
      class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
        try { await call('emailAuth:requestChangeCode', { token: state.token }); stepForm(); }
        catch (e) { err.textContent = errMsg(e); }
      },
    })));
}

// הורה קובע קוד סודי חדש לילד/ה (אפשר גם לאפס שיבחרו לבד).
export function openResetPin(p) {
  const emailRequired = !!state.data.me.email;
  const myPinRequired = !emailRequired;
  const build = () => {
    const input = pinField('new-password');
    const codeIn = emailRequired ? codeField() : null;
    const myPinIn = myPinRequired ? pinField('current-password') : null;
    const err = el('p', { class: 'error', role: 'alert' });
    const run = async (pin) => {
      if (myPinIn && !/^\d{4}$/.test(myPinIn.value)) { err.textContent = 'הקלידו את הקוד הסודי שלכם, 4 ספרות.'; return; }
      try {
        const res = await call('auth:resetPin', {
          token: state.token, personId: p.id, pin,
          emailCode: codeIn ? codeIn.value : undefined,
          myPin: myPinIn ? myPinIn.value : undefined,
        });
        if (res && res.ok === false) {
          err.textContent = res.reason === 'wrongMyPin' ? 'הקוד הסודי שהקלדתם שגוי.'
            : res.reason === 'locked' ? 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.'
            : 'קוד האימות מהמייל שגוי או שפג תוקפו.';
          return;
        }
        closeSheet();
        toast(pin ? `הקוד של ${p.name} עודכן` : `${p.name} יבחר/תבחר קוד חדש בכניסה הבאה`);
      } catch (e) { err.textContent = errMsg(e); }
    };
    openSheet('קוד סודי ל' + p.name, el('div', { class: 'form' },
      codeIn ? el('label', { class: 'field' }, el('span', { text: 'קוד אימות מהמייל' }), codeIn) : null,
      myPinIn ? el('label', { class: 'field' }, el('span', { text: 'הקוד הסודי שלכם, לאישור' }), myPinIn) : null,
      el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), input),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'קביעת הקוד', onclick: () => {
          if (!/^\d{4}$/.test(input.value)) { err.textContent = 'הקוד צריך להיות 4 ספרות.'; return; }
          run(input.value);
        },
      }),
      el('button', { class: 'ghost', type: 'button', text: 'לאפס, ושיבחרו לבד בכניסה הבאה', onclick: () => run(undefined) })));
  };
  if (!emailRequired) { build(); return; }
  const err = el('p', { class: 'error', role: 'alert' });
  openSheet('אישור במייל', el('div', { class: 'form' },
    el('p', { class: 'hint', text: `כדי לקבוע קוד חדש ל${p.name} נשלח קוד אימות ל-${state.data.me.email}.` }),
    err,
    el('button', {
      class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
        try { await call('emailAuth:requestChildResetCode', { token: state.token }); build(); }
        catch (e) { err.textContent = errMsg(e); }
      },
    })));
}
