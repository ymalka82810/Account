import { state, CODE_KEY, THEME_COLOR, TAB_LABELS, AVATARS } from './state.js';
import { $, el, today, errMsg, toast, avatarPicker } from './helpers.js';
import { call } from './api.js';
import { person, isParent, isTeen, parentPendingCount, friendsInboxCount } from './computations.js';
import { openSheet, closeSheet } from './sheet.js';
import { openEntryFlow } from './entryFlow.js';
import { renderEntries } from './entriesList.js';
import { renderPushBtn, syncPush, releasePushDevice } from './push.js';
import { switchTab } from './tabs.js';
import { route, show, subscribeData, setToken, dropSession, wireSession } from './session.js';

import { renderWelcome, renderLogin, initSetup, initJoin, startPin, restoreFamily } from './screens/auth.js';
import { openChangePinEmail } from './screens/emailAuth.js';
import { renderPending } from './screens/pending.js';
import { renderFamily } from './screens/family.js';
import { renderFriends } from './screens/friends.js';
import { cleanPayload } from './screens/legacy.js';
import { mountHomeTab } from '../src-react/mountHome.jsx';

// ---------- ערכות נושא ----------
function applyTheme(role) {
  if (role) document.body.dataset.theme = role; else delete document.body.dataset.theme;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', THEME_COLOR[role] || THEME_COLOR.child);
}

// מזריקים ל-session.js את הפונקציות שהוא צריך, כדי להימנע מתלות מעגלית.
wireSession({ renderApp, renderWelcome, renderLogin, initSetup, initJoin, startPin, applyTheme, restoreFamily });

// ---------- הרכבת המסך הראשי ----------
function renderApp() {
  const role = state.data.me.role;
  applyTheme(role);
  $('meAvatar').textContent = state.data.me.avatar;
  $('meName').textContent = state.data.me.name;
  $('familyName').textContent = state.data.family.name;
  if (isParent()) localStorage.setItem(CODE_KEY, state.data.family.childCode);
  document.querySelectorAll('.parent-only').forEach((n) => (n.hidden = !isParent()));
  document.querySelectorAll('.teen-only').forEach((n) => (n.hidden = !isTeen()));
  $('emailBtn').textContent = state.data.me.email ? '✉️ מייל לשחזור: ' + state.data.me.email : '✉️ הוספת מייל לשחזור קוד';

  const labels = TAB_LABELS[role] || TAB_LABELS.child;
  document.querySelectorAll('.tab').forEach((t) => {
    const count = t.dataset.tab === 'family' ? (isParent() ? parentPendingCount() : 0)
      : t.dataset.tab === 'friends' ? friendsInboxCount() : 0;
    t.replaceChildren(...[labels[t.dataset.tab] || t.textContent, count ? el('span', { class: 'badge', text: String(count) }) : null].filter((x) => x !== null));
  });

  const tbtn = $('teenRequestBtn');
  const mine = person(state.data.me.id);
  tbtn.hidden = role !== 'child';
  const asked = !!(mine && mine.teenRequested);
  tbtn.disabled = asked;
  tbtn.textContent = asked ? '⏳ הבקשה להפוך לנער/ה נשלחה להורים' : '🎧 בקשה להפוך לנער/ה';
  // מסך הבית (summary/bigbtns/myDebts) מנוהל עכשיו ע"י React באופן עצמאי
  // (src-react/mountHome.jsx, דרך useQuery) - לא צריך renderHome() ידני.
  renderPending();
  renderPushBtn();
  syncPush();
  renderEntries($('myHistory'), state.data.entries.filter((e) => e.from === state.data.me.id || e.to === state.data.me.id), 'עדיין לא נרשם כלום.');
  if (isParent()) renderFamily();
  if (isTeen()) renderFriends();

  if (!state.tabInit) {
    state.tabInit = true;
    switchTab(isParent() ? 'family' : 'home');
  } else {
    const active = document.querySelector('.tab.active').dataset.tab;
    if ((active === 'family' && !isParent()) || (active === 'friends' && !isTeen())) switchTab('home');
  }
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ---------- אירועים ----------
// btnIOwe/btnTheyOwe (מסך הבית) מנוהלים עכשיו ע"י React - ראו Home.jsx.

$('logoutBtn').addEventListener('click', async () => {
  await releasePushDevice();
  try { await call('auth:logout', { token: state.token }); } catch (e) { /* ignore */ }
  dropSession();
});

$('changePinBtn').addEventListener('click', () => {
  if (state.data.me.email) { openChangePinEmail(); return; }
  const oldPin = el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: 'current-password' });
  const newPin = el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: 'new-password' });
  const err = el('p', { class: 'error', role: 'alert' });
  openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
    el('label', { class: 'field' }, el('span', { text: 'הקוד הנוכחי' }), oldPin),
    el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
    err,
    el('button', {
      class: 'primary', type: 'button', text: 'שמירה', onclick: async () => {
        if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
        try {
          const res = await call('auth:changeMyPin', { token: state.token, oldPin: oldPin.value, newPin: newPin.value });
          if (res.ok) { closeSheet(); toast('הקוד שונה ✅'); }
          else if (res.reason === 'wrong') err.textContent = 'הקוד הנוכחי לא נכון.';
          else if (res.reason === 'locked') err.textContent = 'יותר מדי ניסיונות. נסו שוב עוד דקה.';
          else if (res.reason === 'useEmail') { closeSheet(); openChangePinEmail(); }
          else err.textContent = 'משהו השתבש. נסו שוב.';
        } catch (e) { err.textContent = errMsg(e); }
      },
    })));
});

const personPicker = avatarPicker($('personAvatars'), AVATARS);
$('personForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('personName').value.trim();
  const pin = $('personPin').value;
  if (!name) return;
  if (pin && !/^\d{4}$/.test(pin)) { toast('הקוד צריך להיות 4 ספרות'); return; }
  try {
    await call('people:add', { token: state.token, name, role: $('personRole').value, avatar: personPicker.get(), pin: pin || undefined });
    $('personName').value = ''; $('personPin').value = '';
    toast(`${name} נוסף/ה למשפחה ✅`);
  } catch (e) { toast(errMsg(e)); }
});

$('exportBtn').addEventListener('click', () => {
  const out = {
    people: state.data.people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    entries: state.data.entries.map((e) => ({ kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note, date: e.date })),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kupa-backup-${today()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('renameFamilyBtn').addEventListener('click', async () => {
  const name = prompt('איך לקרוא למשפחה?', state.data.family.name);
  if (name === null || !name.trim()) return;
  try { await call('family:rename', { token: state.token, name }); toast('השם עודכן ✅'); }
  catch (e) { toast(errMsg(e)); }
});

$('deleteFamilyBtn').addEventListener('click', async () => {
  const typed = prompt(`זה ימחק את כל הקופה: כל האנשים וכל הרשומות, ואי אפשר לבטל.\nכדי לאשר, כתבו את שם המשפחה: ${state.data.family.name}`);
  if (typed === null) return;
  try {
    await call('family:remove', { token: state.token, confirmName: typed });
    localStorage.removeItem(CODE_KEY);
    state.fam = null;
    toast('הקופה נמחקה');
    dropSession();
  } catch (e) { toast(errMsg(e)); }
});

$('importFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (!Array.isArray(s.people) || !Array.isArray(s.entries)) throw new Error('bad');
    if (!confirm(`להוסיף ${s.entries.length} רשומות מהקובץ? שום דבר קיים לא יימחק.`)) return;
    const res = await call('admin:importData', { token: state.token, ...cleanPayload(s) });
    toast(`נוספו ${res.added} רשומות`);
  } catch (e) {
    toast(e && e.data ? errMsg(e) : 'הקובץ לא נראה כמו גיבוי של הקופה');
  }
});

// ---------- התחלה ----------
function init() {
  if (!window.CONVEX_URL || typeof convex === 'undefined') { show('noserver'); return; }
  state.client = new convex.ConvexClient(window.CONVEX_URL);
  state.client.onUpdate('auth:legacyRoster', {}, (r) => {
    state.legacyPeople = r;
    if (state.pinFlow && state.pinFlow.legacy) {
      const fresh = r.find((p) => p.id === state.pinFlow.person.id);
      if (!fresh) state.pinFlow = null;
      else { state.pinFlow.person = fresh; if (!fresh.hasPin && state.pinFlow.mode === 'login') state.pinFlow.mode = 'new'; }
    }
    route();
  }, () => {});
  subscribeData();
  restoreFamily().finally(() => { state.codeChecked = true; route(); });
  route();
  mountHomeTab({ initialToken: state.token, openEntryFlow });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
