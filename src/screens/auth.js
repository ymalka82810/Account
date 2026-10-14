import { state, CODE_KEY, LAST_PERSON_KEY } from '../state.js';
import { el, toast, errMsg, fmtWait } from '../helpers.js';
import { call } from '../api.js';
import { route, setToken } from '../session.js';
import { bumpAuth } from '../authStore.js';
import { openSheet, closeSheet } from '../sheet.js';
import { codeField, pinField } from './emailAuth.js';

// הלוגיקה של מסכי הכניסה. התצוגה שלהם ב-src-react/components/Auth.jsx.

// בודק קוד מול השרת. מחזיר true אם נכנסנו למשפחה.
export async function enterFamily(code, remember) {
  const res = await call('auth:enter', { code });
  if (!res.ok) return res.reason;
  state.fam = { code, name: res.familyName, codeRole: res.codeRole, people: res.people };
  // שומרים במכשיר רק את קוד הילדים, כדי שקוד הורים לא יישאר על מכשיר משותף.
  if (remember) localStorage.setItem(CODE_KEY, res.loginCode);
  return true;
}

// קוד ילדים שמור במכשיר: מרעננים את רשימת המשפחה, ואם הקוד הוחלף מוחקים אותו.
export async function restoreFamily() {
  const saved = localStorage.getItem(CODE_KEY);
  if (!saved) return;
  try {
    const r = await enterFamily(saved, false);
    if (r !== true && r !== 'throttled') { localStorage.removeItem(CODE_KEY); state.fam = null; }
  } catch (e) { /* בלי חיבור: נשארים עם מה שיש */ }
}

// ---------- מסך פתיחה ----------
// מחזיר הודעת שגיאה, או '' אם נכנסנו.
export async function submitFamilyCode(code) {
  try {
    const r = await enterFamily(code, true);
    if (r === true) { state.view = 'welcome'; route(); return ''; }
    if (r === 'throttled') return 'יותר מדי ניסיונות. נסו שוב עוד דקה.';
    return 'הקוד לא נכון. בדקו שוב, או בקשו מההורים.';
  } catch (e) { return errMsg(e); }
}

export function goView(view) { state.view = view; route(); }

// ---------- הקמת משפחה חדשה ----------
export async function createFamily({ familyName, name, avatar, pin }) {
  try {
    const res = await call('auth:createFamily', { familyName, name, avatar, pin });
    state.view = 'welcome';
    setToken(res.token);
    return '';
  } catch (e) { return errMsg(e); }
}

// ---------- הצטרפות עם קוד ----------
export async function joinFamily({ name, avatar, pin }) {
  try {
    const res = await call('auth:join', { code: state.fam.code, name, avatar, pin });
    if (!res.ok) {
      if (res.reason === 'code') leaveFamily();
      return res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד דקה.' : 'הקוד כבר לא תקף. בקשו קוד חדש מההורים.';
    }
    state.view = 'welcome';
    setToken(res.token);
    return '';
  } catch (e) { return errMsg(e); }
}

export function leaveFamily() {
  state.fam = null;
  state.view = 'welcome';
  state.pinFlow = null;
  localStorage.removeItem(CODE_KEY);
  localStorage.removeItem(LAST_PERSON_KEY);
  route();
}

// ---------- קוד סודי ----------
export function startPin(p, legacy) {
  state.pinFlow = { person: p, legacy: !!legacy, mode: p.hasPin ? 'login' : 'new', first: null, entered: '', busy: false, error: '', shakes: 0 };
  if (!legacy) localStorage.setItem(LAST_PERSON_KEY, p.id);
  route();
}

function notMe() {
  state.pinFlow = null;
  state.view = 'login';
  localStorage.removeItem(LAST_PERSON_KEY);
  route();
}

export function pinBack() {
  state.pinFlow = null;
  if (state.fam && state.fam.people.length > 1) { notMe(); return; }
  route();
}

function renderPin(error = '') {
  const f = state.pinFlow;
  if (!f) return;
  f.error = error;
  bumpAuth();
}

function shake() {
  const f = state.pinFlow;
  if (!f) return;
  f.shakes += 1;
  bumpAuth();
}

export async function pressKey(k) {
  const f = state.pinFlow;
  if (!f || f.busy) return;
  if (k === 'del') f.entered = f.entered.slice(0, -1);
  else if (f.entered.length < 4) f.entered += k;
  renderPin();
  if (f.entered.length === 4) await submitPin();
}

// קוד משפחה שהפסיק להיות תקף באמצע הכניסה (ההורים החליפו אותו).
function codeGone() {
  toast('קוד המשפחה השתנה. בקשו קוד חדש מההורים.');
  leaveFamily();
}

async function submitPin() {
  const f = state.pinFlow;
  f.busy = true;
  renderPin();
  const code = f.legacy ? undefined : state.fam.code;
  try {
    if (f.mode === 'login') {
      const res = await call('auth:login', { code, personId: f.person.id, pin: f.entered });
      if (res.ok) { state.pinFlow = null; setToken(res.token); return; }
      f.entered = '';
      if (res.reason === 'code') { codeGone(); return; }
      if (res.reason === 'wrong') renderPin(`הקוד לא נכון. נשארו עוד ${res.left} ניסיונות.`);
      else if (res.reason === 'locked') renderPin(`ניסיתם יותר מדי פעמים. נסו שוב בעוד ${fmtWait(res.waitSeconds)}.`);
      else if (res.reason === 'throttled') renderPin('יותר מדי ניסיונות. נסו שוב עוד דקה.');
      else if (res.reason === 'legacy') renderPin('הורה צריך להיכנס קודם.');
      else { f.mode = 'new'; renderPin(); }
      shake();
    } else if (!f.first) {
      f.first = f.entered; f.entered = '';
      renderPin();
    } else if (f.first !== f.entered) {
      f.first = null; f.entered = '';
      renderPin('הקודים לא היו זהים. נתחיל מחדש.');
      shake();
    } else {
      const res = await call('auth:claimProfile', { code, personId: f.person.id, pin: f.entered });
      if (!res.ok) {
        if (res.reason === 'code') { codeGone(); return; }
        f.first = null; f.entered = '';
        renderPin(res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד דקה.' : 'הורה צריך להיכנס קודם.');
        shake();
        return;
      }
      state.pinFlow = null;
      setToken(res.token);
      return;
    }
  } catch (e) {
    f.entered = ''; f.first = null;
    renderPin(errMsg(e));
    shake();
  } finally {
    f.busy = false;
    bumpAuth();
  }
}

// שכחתי קוד (הורה, במסך הכניסה): קוד למייל המאומת, ואז בוחרים קוד חדש ונכנסים.
// חלונות קופצים: יעברו ל-React יחד עם sheet.js.
export function openForgotPin() {
  const f = state.pinFlow;
  if (!f || f.legacy) return;
  const stepReset = () => {
    const emailCode = codeField();
    const newPin = pinField('new-password');
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('קוד סודי חדש', el('div', { class: 'form' },
      el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), emailCode),
      el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'קביעת הקוד והכניסה', onclick: async () => {
          if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
          try {
            const res = await call('emailAuth:resetWithCode', { code: state.fam.code, personId: f.person.id, emailCode: emailCode.value, newPin: newPin.value });
            if (res.ok) { state.pinFlow = null; setToken(res.token); return; }
            if (res.reason === 'code') { closeSheet(); codeGone(); return; }
            err.textContent = res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.' : 'קוד האימות שגוי או שפג תוקפו.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  };
  const err = el('p', { class: 'error', role: 'alert' });
  openSheet('שכחתי את הקוד', el('div', { class: 'form' },
    el('p', { class: 'hint', text: 'אם הוגדר מייל מאומת להורה הזה, נשלח אליו קוד אימות. אם לא הוגדר מייל, הורה אחר יכול לקבוע לך קוד חדש.' }),
    err,
    el('button', {
      class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
        try {
          const res = await call('emailAuth:requestResetCode', { code: state.fam.code, personId: f.person.id });
          if (res.ok) { stepReset(); return; }
          if (res.reason === 'code') { closeSheet(); codeGone(); return; }
          err.textContent = 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.';
        } catch (e) { err.textContent = errMsg(e); }
      },
    })));
}
