import { state, TOKEN_KEY, LAST_PERSON_KEY, CODE_KEY } from './state.js';
import { $, toast } from './helpers.js';
import { call } from './api.js';
import { closeSheet } from './sheet.js';
import { notifyTokenChange } from '../src-react/mountHome.jsx';

// renderApp, renderWelcome, renderLogin, initSetup, initJoin, startPin, applyTheme
// מוזרקים מ-app.js כדי להימנע מתלות מעגלית בין המודולים.
let renderApp, renderWelcome, renderLogin, initSetup, initJoin, startPin, applyTheme, restoreFamily;
export function wireSession(fns) {
  ({ renderApp, renderWelcome, renderLogin, initSetup, initJoin, startPin, applyTheme, restoreFamily } = fns);
}

export function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name !== 'app') applyTheme('');
  window.scrollTo({ top: 0 });
}

// ---------- ניתוב בין מסכים ----------
export function route() {
  if (state.token) {
    if (state.data === undefined) return show('loading');
    renderApp();
    return show('app');
  }
  if (state.legacyPeople === null || !state.codeChecked) return show('loading');
  if (state.pinFlow) return show('pin');
  if (state.view === 'setup') { initSetup(); return show('setup'); }
  if (state.view === 'join' && state.fam) { initJoin(); return show('join'); }
  if (state.fam) {
    const skip = autoSkipPerson();
    if (skip) { startPin(skip, false); return; }
    renderLogin();
    return show('login');
  }
  renderWelcome();
  show('welcome');
}

// מחליט אם אפשר לדלג ישר למסך הקוד הסודי בלי להציג את רשימת הפרופילים:
// אם יש רק איש/ה אחת במשפחה, או אם זה/ו האחרון/ה שנכנס/ה מהמכשיר הזה.
export function autoSkipPerson() {
  if (state.view === 'login') return null; // המשתמש ביקש לראות את הרשימה (למשל לחיצה על "לא אני")
  if (state.fam.people.length === 1) return state.fam.people[0];
  const lastId = localStorage.getItem(LAST_PERSON_KEY);
  if (lastId) return state.fam.people.find((p) => p.id === lastId) || null;
  return null;
}

export function subscribeData() {
  if (state.unsubData) { state.unsubData(); state.unsubData = null; }
  if (state.unsubFriends) { state.unsubFriends(); state.unsubFriends = null; }
  state.data = undefined;
  state.fdata = null;
  if (!state.token) return;
  state.unsubFriends = state.client.onUpdate('friends:get', { token: state.token }, (d) => {
    state.fdata = d || null;
    if (state.data) renderApp();
  }, () => {});
  state.unsubData = state.client.onUpdate('data:get', { token: state.token }, (d) => {
    if (d === null) { dropSession(); return; }
    if (d.legacy) { handleLegacySession(d); return; }
    state.data = d;
    route();
  }, () => {});
}

// חשבון מהגרסה הישנה (בלי משפחה): הורה מעביר את הקופה למשפחה עם קודים. ילדים נכנסים מחדש עם קוד.
async function handleLegacySession(d) {
  if (!d.canMigrate) { toast('צריך להיכנס מחדש עם קוד המשפחה'); dropSession(); return; }
  if (state.migrating) return;
  state.migrating = true;
  try { await call('auth:migrateMe', { token: state.token }); }
  catch (e) { dropSession(); }
  finally { state.migrating = false; }
}

export function setToken(t) {
  state.token = t;
  localStorage.setItem(TOKEN_KEY, t);
  notifyTokenChange(t);
  closeSheet();
  subscribeData();
  route();
}

export function dropSession() {
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  notifyTokenChange('');
  if (state.unsubData) { state.unsubData(); state.unsubData = null; }
  if (state.unsubFriends) { state.unsubFriends(); state.unsubFriends = null; }
  state.data = undefined;
  state.fdata = null;
  state.tabInit = false;
  state.pinFlow = null;
  closeSheet();
  state.codeChecked = false;
  route();
  restoreFamily().finally(() => { state.codeChecked = true; route(); });
}
