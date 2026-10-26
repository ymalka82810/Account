import { state, CODE_KEY, LAST_PERSON_KEY, TOKEN_KEY, bumpAuth } from './state.js';
import { toast, errMsg, fmtWait } from '../lib/helpers.js';
import { call } from '../lib/api.js';
import { DEMO_TOKEN } from '../lib/demo.js';
import { PARENT_PIN_MAX } from '../lib/pin.js';
import { t } from '../i18n/index.js';

// הלוגיקה של מסכי הכניסה. התצוגה שלהם ב-src-react/components/Auth.jsx.

// בודק קוד מול השרת. מחזיר true אם נכנסנו למשפחה.
export async function enterFamily(code, remember) {
  // התווית עוזרת להורה לזהות את המכשיר ברשימת "מכשירים מחוברים".
  const label = remember ? (navigator.userAgentData?.platform || navigator.platform || t('מכשיר')).slice(0, 40) : undefined;
  const res = await call('auth:enter', { code, remember: !!remember, label });
  if (!res.ok) return res.reason;
  state.fam = { code, name: res.familyName, people: res.people };
  // שומרים במכשיר כרטיס כניסה (לא את קוד ההצטרפות), לכניסות הבאות.
  if (remember && res.loginCode) localStorage.setItem(CODE_KEY, res.loginCode);
  return true;
}

// כרטיס הכניסה שמור במכשיר: מרעננים את רשימת המשפחה, ואם הכרטיס בוטל מוחקים אותו.
// מכשיר שעוד שומר את קוד ההצטרפות עצמו (גרסה קודמת) מחליף אותו בכרטיס.
export async function restoreFamily() {
  const saved = localStorage.getItem(CODE_KEY);
  if (!saved) return;
  try {
    const r = await enterFamily(saved, !saved.startsWith('dev_'));
    if (r !== true && r !== 'throttled') { localStorage.removeItem(CODE_KEY); state.fam = null; }
  } catch (e) { /* בלי חיבור: נשארים עם מה שיש */ }
}

// ---------- מצב הכניסה ----------
// ה-state (token, fam, view, pinFlow, ...) נשאר ב-state.js, ו-App.jsx קורא
// ממנו בכל רינדור. route() רק מודיע לו שמשהו השתנה.
export const route = bumpAuth;

export function setToken(t) {
  state.token = t;
  localStorage.setItem(TOKEN_KEY, t);
  bumpAuth();
}

// דמו: כניסה לאפליקציה עם נתוני דוגמה. הטוקן לא נשמר במכשיר, אז רענון מחזיר למסך הפתיחה.
export function startDemo() {
  state.token = DEMO_TOKEN;
  state.pinFlow = null;
  bumpAuth();
}

// סיום הדמו בקריאה לפעולה: יוצאים מהדמו ופותחים ישר את הפנקס האישי או את הקמת הקופה.
export function endDemo(to) {
  state.token = '';
  state.pinFlow = null;
  state.fromNotebook = false;
  state.notebookBack = false;
  goView(to);
}

export function dropSession() {
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  state.pinFlow = null;
  state.view = 'login';
  state.codeChecked = false;
  bumpAuth();
  restoreFamily().finally(() => { state.codeChecked = true; bumpAuth(); });
}

// ---------- מסך פתיחה ----------
// מחזיר הודעת שגיאה, או '' אם נכנסנו.
export async function submitFamilyCode(code) {
  try {
    const r = await enterFamily(code, true);
    if (r === true) { state.view = 'welcome'; route(); return ''; }
    if (r === 'throttled') return t('יותר מדי ניסיונות. נסו שוב עוד דקה.');
    return t('הקוד לא נכון. בדקו שוב, או בקשו מההורים.');
  } catch (e) { return errMsg(e); }
}

export function goView(view) { state.view = view; route(); }

// מעבר לפנקס האישי ממסכי המשפחה. רק כך מוצג בפנקס כפתור חזרה (מכשיר חדש נפתח בו ישר, ואין לאן לחזור).
export function openNotebook() { state.notebookBack = true; goView('notebook'); }
export function closeNotebook() { state.notebookBack = false; goView('welcome'); }

// שדרוג מהפנקס למשפחה (הקמה או הצטרפות עם קוד). "חזרה" מהמסך שנפתח מחזירה לפנקס.
export function upgradeFromNotebook(view) { state.fromNotebook = true; goView(view); }
export function backFromFamily() { const nb = state.fromNotebook; state.fromNotebook = false; goView(nb ? 'notebook' : 'welcome'); }

// ---------- הקמת משפחה חדשה ----------
export async function createFamily({ familyName, name, birthDate, avatar, gender, pin, country, currency }) {
  try {
    const res = await call('auth:createFamily', { familyName, name, birthDate, avatar, gender, pin, country, currency });
    state.view = 'welcome';
    setToken(/** @type {any} */ (res).token); // join מחזיר היום רק pending, לא טוקן
    return '';
  } catch (e) { return errMsg(e); }
}

// ---------- הצטרפות עם קוד ----------
export async function joinFamily({ name, avatar, pin, gender }) {
  try {
    const args = { code: state.fam.code, name, avatar, pin };
    if (gender) args.gender = gender;
    const res = await call('auth:join', args);
    if (!res.ok) {
      if (res.reason === 'code') leaveFamily();
      return res.reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד דקה.') : t('הקוד כבר לא תקף. בקשו קוד חדש מההורים.');
    }
    // הבקשה ממתינה לאישור הורה. אין סשן עד שהורה מאשר, ואז נכנסים דרך מסך הבחירה עם הקוד שנבחר.
    if (res.pending) return { pending: true };
    state.view = 'welcome';
    setToken(/** @type {any} */ (res).token); // join מחזיר היום רק pending, לא טוקן
    return '';
  } catch (e) { return errMsg(e); }
}

export function leaveFamily() {
  const saved = localStorage.getItem(CODE_KEY);
  if (saved && saved.startsWith('dev_')) call('auth:forgetPass', { pass: saved }).catch(() => {});
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
  // גם במשפחה עם בן משפחה אחד חוזרים למסך הבחירה, אחרת הדילוג האוטומטי מחזיר מיד לקוד הסודי.
  if (state.fam) { notMe(); return; }
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

// אורך הקוד במסך הכניסה. בכניסה האורך ידוע (נשמר בפרופיל) והשליחה אוטומטית בסופו.
// הורה שקובע קוד חדש בוחר אורך חופשי (4 עד 8) ושולח במפורש עם ✓.
export function pinPadSpec(f) {
  if (f.mode === 'login') return { max: f.person.pinLength || 4, auto: true };
  if (f.person.role === 'parent') return { max: PARENT_PIN_MAX, auto: false };
  return { max: 4, auto: true };
}

export async function pressKey(k) {
  const f = state.pinFlow;
  if (!f || f.busy) return;
  const { max, auto } = pinPadSpec(f);
  if (k === 'ok') {
    if (f.entered.length >= 4) await submitPin();
    return;
  }
  if (k === 'del') f.entered = f.entered.slice(0, -1);
  else if (f.entered.length < max) f.entered += k;
  renderPin();
  if (auto && f.entered.length === max) await submitPin();
}

// קוד משפחה שהפסיק להיות תקף באמצע הכניסה (ההורים החליפו אותו).
export function codeGone() {
  toast(t('קוד המשפחה השתנה. בקשו קוד חדש מההורים.'));
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
      if (res.reason === 'wrong') renderPin(t('הקוד לא נכון. נשארו עוד {left} ניסיונות.', { left: res.left }));
      else if (res.reason === 'locked') renderPin(t('ניסיתם יותר מדי פעמים. נסו שוב בעוד {wait}.', { wait: fmtWait(res.waitSeconds) }));
      else if (res.reason === 'throttled') renderPin(t('יותר מדי ניסיונות. נסו שוב עוד דקה.'));
      else if (res.reason === 'legacy') renderPin(t('הורה צריך להיכנס קודם.'));
      else { f.mode = 'new'; renderPin(); }
      shake();
    } else if (!f.first) {
      f.first = f.entered; f.entered = '';
      renderPin();
    } else if (f.first !== f.entered) {
      f.first = null; f.entered = '';
      renderPin(t('הקודים לא היו זהים. נתחיל מחדש.'));
      shake();
    } else {
      const res = await call('auth:claimProfile', { code, personId: f.person.id, pin: f.entered });
      if (!res.ok) {
        if (res.reason === 'code') { codeGone(); return; }
        f.first = null; f.entered = '';
        renderPin(res.reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד דקה.') : t('הורה צריך להיכנס קודם.'));
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

// מחליט אם אפשר לדלג ישר למסך הקוד הסודי בלי להציג את רשימת הפרופילים:
// אם יש רק איש/ה אחת במשפחה, או אם זה/ו האחרון/ה שנכנס/ה מהמכשיר הזה.
export function autoSkipPerson() {
  if (!state.fam || state.view === 'login') return null; // 'login' = המשתמש ביקש לראות את הרשימה (למשל "לא אני")
  if (state.fam.people.length === 1) return state.fam.people[0];
  const lastId = localStorage.getItem(LAST_PERSON_KEY);
  if (lastId) return state.fam.people.find((p) => p.id === lastId) || null;
  return null;
}
