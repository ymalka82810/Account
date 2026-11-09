import { state, CODE_KEY, LAST_PERSON_KEY, TOKEN_KEY, bumpAuth } from './state.js';
import { toast, errMsg, fmtWait } from '../lib/helpers.js';
import { call } from '../lib/api.js';
import { DEMO_TOKEN } from '../lib/demo.js';
import { PARENT_PIN_MAX } from '../lib/pin.js';
import { BioError, bioLoginProof, bioRegister, bioSupported } from '../lib/biometric.js';
import { t } from '../i18n/index.js';
import { forgetMembershipByToken, getMemberships } from '../lib/memberships.js';
import { upsertCard, removeCard, getCards, savedFamilies } from '../lib/cards.js';

// הלוגיקה של מסכי הכניסה. התצוגה שלהם ב-src-react/components/Auth.jsx.

// בודק קוד מול השרת. מחזיר true אם נכנסנו למשפחה.
export async function enterFamily(code, remember) {
  // התווית עוזרת להורה לזהות את המכשיר ברשימת "מכשירים מחוברים".
  const label = remember ? (navigator.userAgentData?.platform || navigator.platform || t('מכשיר')).slice(0, 40) : undefined;
  const res = await call('auth:enter', { code, remember: !!remember, label });
  if (!res.ok) return res.reason;
  state.fam = { code, familyId: res.familyId ? String(res.familyId) : '', name: res.familyName, people: res.people };
  // שומרים במכשיר כרטיס כניסה (לא את קוד ההצטרפות), לכניסות הבאות.
  if (remember && res.loginCode) {
    localStorage.setItem(CODE_KEY, res.loginCode);
    if (res.familyId) upsertCard({ familyId: String(res.familyId), name: res.familyName, card: res.loginCode });
  }
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
  // הטוקן שהשרת כבר לא מכיר (יציאה, פג תוקף) לא נשאר ברשימת המשפחות של המכשיר.
  if (state.token) forgetMembershipByToken(state.token);
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  try { localStorage.removeItem('kupa-outbox-v1'); } catch (e) { /* */ }
  state.pinFlow = null;
  state.view = 'login';
  state.codeChecked = false;
  bumpAuth();
  restoreFamily().finally(() => { state.codeChecked = true; bumpAuth(); });
}

// המשפחות שהמכשיר מכיר, חוץ מהנוכחית (לפי כרטיס כניסה ו/או כניסה פעילה).
export const otherFamilies = (exceptFamilyId) => savedFamilies(getMemberships(), exceptFamilyId);

// מעבר למשפחה אחרת במכשיר הזה, בלי קוד משפחה. אם יש כניסה פעילה (token) עוברים אליה ישר.
// אחרת נפתח מסך הבחירה במשפחה עם הכרטיס השמור, ונדרש רק הקוד הסודי של מי שנכנס.
export async function goToFamily(f) {
  if (f.token) { if (f.token !== state.token) setToken(f.token); return ''; }
  if (!f.card) return t('צריך את קוד המשפחה כדי להיכנס אליה');
  const prevToken = state.token;
  try {
    const r = await enterFamily(f.card, true);
    if (r === true) { state.token = ''; state.pinFlow = null; state.view = 'welcome'; route(); return ''; }
    if (r === 'throttled') return t('יותר מדי ניסיונות. נסו שוב עוד דקה.');
    // הכרטיס בוטל (הורה הסיר את המכשיר או החליף את קוד המשפחה): מסירים אותו ומבקשים קוד חדש.
    removeCard(f.card);
    return t('המשפחה הזאת הסירה את המכשיר. כדי להיכנס שוב צריך את קוד המשפחה.');
  } catch (e) { state.token = prevToken; return errMsg(e); }
}

// האם נפתחה/הצטרפו כבר למשפחה כלשהי במכשיר הזה. מי שכבר יש לו משפחה מקים את הבאה רק מאזור ההורה.
export function deviceHasFamily() {
  try { return !!(state.fam || state.token || localStorage.getItem(CODE_KEY) || localStorage.getItem(TOKEN_KEY) || otherFamilies().length); }
  catch (e) { return !!state.fam; }
}

// הקמת משפחה נוספת מאזור ההורה: מרוקנים רק את הכניסה הפעילה (המשפחה הנוכחית והכרטיס שלה נשארים) ופותחים את מסך ההקמה.
export function startNewFamily() {
  state.token = '';
  state.pinFlow = null;
  state.fam = null;
  state.fromNotebook = false;
  state.view = 'setup';
  state.codeChecked = true;
  bumpAuth();
}

// הצטרפות למשפחה נוספת: מרוקנים רק את הכניסה הפעילה, בלי להוציא את המשפחה הנוכחית ובלי למחוק את הכרטיס שלה.
export function addAnotherFamily() {
  state.token = '';
  state.pinFlow = null;
  state.fam = null;
  state.view = 'welcome';
  state.codeChecked = true;
  bumpAuth();
}

// "משפחה אחרת" ממסך הבחירה: חוזרים למסך הפתיחה, והכרטיס של המשפחה נשאר במכשיר.
export function leaveToWelcome() {
  state.fam = null;
  state.view = 'welcome';
  state.pinFlow = null;
  route();
}

// ---------- מסך פתיחה ----------
// מחזיר הודעת שגיאה, או '' אם נכנסנו.
export async function submitFamilyCode(code) {
  try {
    const r = await enterFamily(code, true);
    // אחרי הקלדת קוד משפחה תמיד מוצגת רשימת "מי נכנס/ת?" עם "אני חדש/ה", בלי דילוג למישהו קיים.
    if (r === true) { localStorage.removeItem(LAST_PERSON_KEY); state.view = 'login'; route(); return ''; }
    if (r === 'throttled') return t('יותר מדי ניסיונות. נסו שוב עוד דקה.');
    return t('הקוד לא נכון. בדקו שוב, או בקשו מההורים.');
  } catch (e) { return errMsg(e); }
}

export function goView(view) { if (view !== 'notebook') state.offlineNotebook = false; state.view = view; route(); }

// מעבר לפנקס האישי ממסכי המשפחה. רק כך מוצג בפנקס כפתור חזרה (מכשיר חדש נפתח בו ישר, ואין לאן לחזור).
export function openNotebook() { state.notebookBack = true; goView('notebook'); }
export function closeNotebook() { state.notebookBack = false; goView('welcome'); }
// מסך "אין חיבור": הפנקס עובד במכשיר, גם למי שיש לו כניסה שמורה (שהשרת לא עונה לה כרגע).
export function openNotebookOffline() { state.offlineNotebook = true; openNotebook(); }

// שדרוג מהפנקס למשפחה (הקמה או הצטרפות עם קוד). "חזרה" מהמסך שנפתח מחזירה לפנקס.
export function upgradeFromNotebook(view) { state.fromNotebook = true; goView(view); }
export function backFromFamily() { const nb = state.fromNotebook; state.fromNotebook = false; goView(nb ? 'notebook' : 'welcome'); }

// ---------- הקמת משפחה חדשה ----------
export async function createFamily({ familyName, name, birthDate, avatar, gender, pin, country, currency }) {
  try {
    const res = await call('auth:createFamily', { familyName, name, birthDate, avatar, gender, pin, country, currency });
    // ההורה הראשון נקשר למכשיר הזה מיד, בזמן שהקוד הסודי עוד בידינו. אם זה נכשל או בוטל,
    // מסך "קישור המכשיר" בתוך האפליקציה לא יניח להמשיך בלי זה.
    try { if (await bioSupported()) await bioRegister(/** @type {any} */ (res).token, pin); } catch (e) { /* המסך בתוך האפליקציה ימשיך משם */ }
    state.view = 'welcome';
    state.justCreatedFamily = true; // App פותח מיד חלון להוספת בני משפחה
    setToken(/** @type {any} */ (res).token); // join מחזיר היום רק pending, לא טוקן
    return '';
  } catch (e) { return errMsg(e); }
}

// ---------- הצטרפות עם קוד ----------
export async function joinFamily({ name, avatar, pin, gender }) {
  try {
    // ההצטרפות מותנית באישור הילד/ה שההורים יראו את הפנקס האישי שלו/ה לצפייה בלבד (Join.jsx).
    const args = { code: state.fam.code, name, avatar, pin, shareNotebook: true };
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
  if (saved && saved.startsWith('dev_')) { call('auth:forgetPass', { pass: saved }).catch(() => {}); removeCard(saved); }
  state.fam = null;
  state.view = 'welcome';
  state.pinFlow = null;
  localStorage.removeItem(CODE_KEY);
  localStorage.removeItem(LAST_PERSON_KEY);
  route();
}

// ---------- קוד סודי ----------
export function startPin(p, legacy) {
  state.pinFlow = { person: p, legacy: !!legacy, mode: p.hasPin ? 'login' : (p.freeEntry && !legacy ? 'free' : 'new'), first: null, entered: '', busy: false, error: '', shakes: 0 };
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
  // חוזרים למסך הבחירה, אחרת הדילוג האוטומטי מחזיר מיד לקוד הסודי.
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

// כניסה בלי קוד סודי (ילד/ה או נער/ה שנוספו בלי קוד): לחיצה אחת, בלי הקשת קוד.
export async function enterFree() {
  const f = state.pinFlow;
  if (!f || f.busy || !state.fam) return;
  f.busy = true;
  renderPin();
  try {
    const res = await call('auth:enterFree', { code: state.fam.code, personId: f.person.id });
    if (res.ok) { signedIn(f, res.token); return; }
    if (res.reason === 'code') { codeGone(); return; }
    if (res.reason === 'throttled') renderPin(t('יותר מדי ניסיונות. נסו שוב עוד דקה.'));
    else { f.mode = 'new'; renderPin(); } // ההורה הגדיר קוד בינתיים
  } catch (e) {
    renderPin(errMsg(e));
  } finally {
    f.busy = false;
    bumpAuth();
  }
}

// קוד משפחה שהפסיק להיות תקף באמצע הכניסה (ההורים החליפו אותו).
export function codeGone() {
  toast(t('קוד המשפחה השתנה. בקשו קוד חדש מההורים.'));
  leaveFamily();
}

// כניסה שהצליחה. רק עכשיו המכשיר זוכר את מי שנכנס, כדי לדלג אליו בפעם הבאה:
// לחיצה על שם של מישהו אחר (בטעות, או ממכשיר חדש) לא תקבע לאן המכשיר ידלג.
function signedIn(f, token) {
  state.pinFlow = null;
  if (!f.legacy) localStorage.setItem(LAST_PERSON_KEY, f.person.id);
  setToken(token);
}

async function submitPin() {
  const f = state.pinFlow;
  f.busy = true;
  renderPin();
  const code = f.legacy ? undefined : state.fam.code;
  try {
    if (f.mode === 'login') {
      // הורה שקשור למכשירים נכנס רק מאחד מהם: חתימה של המפתח שבמכשיר, נוסף על הקוד הסודי.
      let proof;
      if (f.person.role === 'parent' && f.person.deviceBound && !f.legacy) {
        try { proof = await bioLoginProof(f.person.id, code); }
        catch (e) {
          f.entered = '';
          if (e instanceof BioError && e.code === 'code') { codeGone(); return; }
          renderPin(e instanceof BioError ? e.message : errMsg(e));
          shake();
          return;
        }
      }
      const res = await call('auth:login', { code, personId: f.person.id, pin: f.entered, proof });
      if (res.ok) { signedIn(f, res.token); return; }
      f.entered = '';
      if (res.reason === 'code') { codeGone(); return; }
      if (res.reason === 'device') { renderPin(t('המכשיר הזה לא קשור להורה הזה. כדי להוסיף אותו או להחליף מכשיר, לחצו על "מכשיר חדש / החלפת מכשיר".')); shake(); return; }
      if (res.reason === 'needBind') { renderPin(t('כדי להיכנס כהורה צריך לקשר את המכשיר הזה עם קוד קישור מהורה אחר. לחצו על "מכשיר חדש / החלפת מכשיר".')); shake(); return; }
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
      signedIn(f, res.token);
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
// רק אם זה/ו האחרון/ה שנכנס/ה בהצלחה מהמכשיר הזה.
export function autoSkipPerson() {
  if (!state.fam || state.view === 'login') return null; // 'login' = המשתמש ביקש לראות את הרשימה (למשל "לא אני")
  // רק מי שכבר נכנס מהמכשיר הזה. גם במשפחה עם בן משפחה אחד לא מדלגים אליו: מכשיר חדש שהקליד קוד משפחה
  // הוא בדרך כלל מישהו חדש (למשל הורה שני), והוא צריך לראות את הרשימה ואת "אני חדש/ה".
  const lastId = localStorage.getItem(LAST_PERSON_KEY);
  if (lastId) return state.fam.people.find((p) => p.id === lastId) || null;
  return null;
}
