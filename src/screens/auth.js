import { state, CODE_KEY, LAST_PERSON_KEY, AVATARS } from '../state.js';
import { $, el, toast, errMsg, fmtWait, prettyCode, avatarPicker, withBusy } from '../helpers.js';
import { call } from '../api.js';
import { route, setToken } from '../session.js';
import { openSheet, closeSheet } from '../sheet.js';
import { codeField, pinField } from './emailAuth.js';

// ---------- מסך פתיחה: קוד משפחה ----------
const showCodeError = (msg) => { const e = $('codeError'); e.textContent = msg; e.hidden = !msg; };

export function renderWelcome() {
  const box = $('legacyLogin');
  const parents = state.legacyPeople || [];
  box.hidden = parents.length === 0;
  $('legacyTiles').replaceChildren(...parents.map((p) => el('button', {
    class: 'tile', type: 'button', onclick: () => startPin(p, true),
  }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name }))));
}

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

$('codeInput').addEventListener('input', (ev) => { ev.target.value = prettyCode(ev.target.value); showCodeError(''); });
$('codeForm').addEventListener('submit', withBusy($('codeForm').querySelector('button[type=submit]'), async (ev) => {
  ev.preventDefault();
  showCodeError('');
  try {
    const r = await enterFamily($('codeInput').value, true);
    if (r === true) { $('codeInput').value = ''; state.view = 'welcome'; route(); }
    else if (r === 'throttled') showCodeError('יותר מדי ניסיונות. נסו שוב עוד דקה.');
    else showCodeError('הקוד לא נכון. בדקו שוב, או בקשו מההורים.');
  } catch (e) { showCodeError(errMsg(e)); }
}));

$('newFamilyBtn').addEventListener('click', () => { state.view = 'setup'; route(); });

// ---------- הקמת משפחה חדשה ----------
export function initSetup() {
  if (!state.setupPicker) state.setupPicker = avatarPicker($('setupAvatars'), AVATARS);
}
$('setupBack').addEventListener('click', () => { state.view = 'welcome'; route(); });
$('setupForm').addEventListener('submit', withBusy($('setupForm').querySelector('button[type=submit]'), async (ev) => {
  ev.preventDefault();
  const err = $('setupError');
  err.hidden = true;
  try {
    const res = await call('auth:createFamily', {
      familyName: $('setupFamily').value, name: $('setupName').value,
      avatar: state.setupPicker.get(), pin: $('setupPin').value,
    });
    $('setupPin').value = '';
    state.view = 'welcome';
    setToken(res.token);
  } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
}));

// ---------- הצטרפות עם קוד ----------
export function initJoin() {
  if (!state.joinPicker) state.joinPicker = avatarPicker($('joinAvatars'), AVATARS);
  $('joinHint').textContent = state.fam.codeRole === 'parent'
    ? `מצטרפים לקופה של ${state.fam.name} בתור הורה.`
    : `מצטרפים לקופה של ${state.fam.name} בתור ילד/ה.`;
}
$('joinBack').addEventListener('click', () => { state.view = 'welcome'; route(); });
$('joinForm').addEventListener('submit', withBusy($('joinForm').querySelector('button[type=submit]'), async (ev) => {
  ev.preventDefault();
  const err = $('joinError');
  err.hidden = true;
  try {
    const res = await call('auth:join', {
      code: state.fam.code, name: $('joinName').value, avatar: state.joinPicker.get(), pin: $('joinPin').value,
    });
    if (!res.ok) {
      err.textContent = res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד דקה.' : 'הקוד כבר לא תקף. בקשו קוד חדש מההורים.';
      err.hidden = false;
      if (res.reason === 'code') leaveFamily();
      return;
    }
    $('joinPin').value = ''; $('joinName').value = '';
    state.view = 'welcome';
    setToken(res.token);
  } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
}));

export function leaveFamily() {
  state.fam = null;
  state.view = 'welcome';
  state.pinFlow = null;
  localStorage.removeItem(CODE_KEY);
  localStorage.removeItem(LAST_PERSON_KEY);
  route();
}

// ---------- בחירת פרופיל ----------
export function renderLogin() {
  $('loginFamily').textContent = state.fam.name;
  const tiles = state.fam.people.map((p) => el('button', {
    class: 'tile', type: 'button', onclick: () => startPin(p, false),
  }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name })));
  tiles.push(el('button', {
    class: 'tile', type: 'button', onclick: () => { state.view = 'join'; route(); },
  }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: '➕' }), el('span', { class: 'tname', text: 'אני חדש/ה' })));
  $('loginTiles').replaceChildren(...tiles);
}
$('loginBack').addEventListener('click', leaveFamily);

// ---------- קוד סודי ----------
function buildPad() {
  const pad = $('pinPad');
  if (pad.childElementCount) return;
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach((k) => {
    if (k === '') { pad.append(el('span')); return; }
    pad.append(el('button', {
      type: 'button', class: 'key' + (k === 'del' ? ' del' : ''),
      'aria-label': k === 'del' ? 'מחיקה' : k, text: k === 'del' ? '⌫' : k,
      onclick: () => pressKey(k),
    }));
  });
}

export function startPin(p, legacy) {
  state.pinFlow = { person: p, legacy: !!legacy, mode: p.hasPin ? 'login' : 'new', first: null, entered: '', busy: false };
  if (!legacy) localStorage.setItem(LAST_PERSON_KEY, p.id);
  buildPad();
  renderPin();
  route();
}

function notMe() {
  state.pinFlow = null;
  state.view = 'login';
  localStorage.removeItem(LAST_PERSON_KEY);
  route();
}

export function renderPin(error = '') {
  const f = state.pinFlow;
  if (!f) return;
  $('pinAvatar').textContent = f.person.avatar;
  $('pinName').textContent = f.person.name;
  $('pinTitle').textContent = f.mode === 'login'
    ? 'כתבו את הקוד הסודי'
    : f.first ? 'כתבו את הקוד שוב, לאישור' : 'בחרו קוד סודי חדש (4 ספרות)';
  $('pinDots').replaceChildren(...[0, 1, 2, 3].map((i) => el('span', { class: 'dot' + (i < f.entered.length ? ' on' : '') })));
  $('pinDots').classList.toggle('busy', !!f.busy);
  $('pinError').textContent = f.busy ? 'בודקים…' : error;
  $('forgotPinBtn').hidden = !(f.mode === 'login' && f.person.role === 'parent' && !f.legacy);
}

function shake() {
  const d = $('pinDots');
  d.classList.remove('shake');
  void d.offsetWidth;
  d.classList.add('shake');
}

async function pressKey(k) {
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
  }
}

$('pinBack').addEventListener('click', () => {
  state.pinFlow = null;
  if (state.fam && state.fam.people.length > 1) { notMe(); return; }
  route();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('sheetWrap').hidden) { closeSheet(); return; }
  if (!state.pinFlow || state.token || !$('screen-pin').classList.contains('active')) return;
  if (/^\d$/.test(ev.key)) pressKey(ev.key);
  else if (ev.key === 'Backspace') pressKey('del');
});

// שכחתי קוד (הורה, במסך הכניסה): קוד למייל המאומת, ואז בוחרים קוד חדש ונכנסים.
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
$('forgotPinBtn').addEventListener('click', openForgotPin);
