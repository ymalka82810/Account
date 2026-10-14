import { state, FRIEND_MAX } from '../state.js';
import { $, el, money, fmtDate, errMsg, toast, withBusy } from '../helpers.js';
import { call } from '../api.js';
import { isPending, pairOwes, openDebtsOf, nameOf, subjectWord, toWord, friendList, debtLabel } from '../computations.js';
import { openEntryFlow } from '../entryFlow.js';
import { renderEntries } from '../entriesList.js';

// ---------- מצב חברים (בני נוער) ----------
const friendFlow = (opts) => ({
  ...opts, entries: () => state.fdata.entries, people: friendList(), endpoint: 'friends:addEntry', maxEntry: FRIEND_MAX,
  doneToast: 'נשלח לחבר/ה לאישור ⏳', returnTab: 'friends',
});

export function startFriendFlow(opts) {
  if (!friendList().length) { toast('עוד אין חברים מאושרים. הוסיפו חבר/ה לפי המייל שלהם.'); return; }
  openEntryFlow(friendFlow(opts));
}

async function removeFriendship(f, p) {
  if (!confirm(`להסיר את ${p.name} מהחברים?`)) return;
  try { await call('friends:removeFriend', { token: state.token, friendshipId: f.id }); toast('החבר/ה הוסרו'); }
  catch (e) { toast(errMsg(e)); }
}

export function renderFriends() {
  const locked = $('friendsLocked'), on = $('friendsOn');
  if (!state.fdata || state.fdata.kind !== 'teen') { locked.hidden = true; on.hidden = true; return; }
  if (!state.fdata.enabled) {
    locked.hidden = false; on.hidden = true;
    $('friendsRequestBtn').hidden = state.fdata.requested;
    $('friendsPendingBadge').hidden = !state.fdata.requested;
    $('friendsLockNote').textContent = state.fdata.requested ? 'הבקשה נשלחה להורים. נעדכן אותך כשיאשרו.' : '';
    return;
  }
  locked.hidden = true; on.hidden = false;
  const me = state.data.me.id;
  const entries = state.fdata.entries;
  let owe = 0, get = 0;
  const cards = [];
  for (const f of state.fdata.friendships) {
    const p = state.fdata.people[f.other];
    if (!p) continue;
    if (f.status !== 'accepted') {
      if (f.incoming) continue; // בקשות נכנסות מוצגות בתיבה למעלה
      cards.push(el('div', { class: 'debt' },
        el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
        el('div', { class: 'text' },
          el('div', { class: 'who', text: p.name }),
          el('div', { class: 'meta', text: '⏳ ממתין שיאשרו את הבקשה' })),
        el('button', { class: 'small', type: 'button', text: 'ביטול', onclick: () => removeFriendship(f, p) })));
      continue;
    }
    const n = pairOwes(me, p.id, entries);
    const iOwe = n > 0;
    const amount = Math.abs(n);
    if (n > 0) owe += amount; else if (n < 0) get += amount;
    // החובות הפתוחים בכיוון הזה, כל אחד עם מה שנשאר ממנו וכפתור החזר משלו.
    const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
    const open = n === 0 ? [] : openDebtsOf(dFrom, dTo, entries);
    const lines = open.map((x) => el('div', { class: 'debt-line' },
      el('div', { class: 'dl-text' },
        el('div', { class: 'dl-name', text: debtLabel(x.debt) }),
        el('div', { class: 'dl-rem', text: x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining) })),
      el('button', {
        class: 'small', type: 'button', text: iOwe ? 'שילמתי' : 'קיבלתי',
        onclick: () => openEntryFlow(friendFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })),
      })));
    cards.push(el('div', { class: 'debt' + (n === 0 ? '' : iOwe ? ' owe' : ' get') + (lines.length > 1 ? ' multi' : '') },
      el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
      el('div', { class: 'text' },
        el('div', { class: 'who', text: n === 0 ? p.name : iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי` }),
        el('div', { class: 'amt', text: n === 0 ? 'הכול מסודר ✅' : money(amount) }),
        lines.length > 1 ? el('div', { class: 'debt-lines' }, lines) : null),
      n === 0 ? null : el('button', {
        class: 'small strongbtn', type: 'button', text: iOwe ? '💰 שילמתי' : '💰 קיבלתי',
        onclick: () => openEntryFlow(friendFlow(iOwe
          ? { kind: 'payment', from: me, to: p.id, suggest: amount }
          : { kind: 'payment', from: p.id, to: me, suggest: amount })),
      }),
      el('button', { class: 'small danger', type: 'button', text: 'הסרה', 'aria-label': 'הסרת ' + p.name, onclick: () => removeFriendship(f, p) })));
  }
  $('fSumOwe').textContent = money(owe);
  $('fSumGet').textContent = money(get);
  const list = $('friendsList');
  list.replaceChildren();
  if (!cards.length) list.append(el('div', { class: 'empty' }, el('div', { class: 'big-emoji', text: '🤝', 'aria-hidden': 'true' }), 'עוד אין חברים. הוסיפו חבר/ה לפי המייל שלהם.'));
  else cards.forEach((c) => list.append(c));

  // תיבת נכנס: בקשות חברות, ורישומים שחבר/ה רשמו וממתינים לאישור שלך.
  const inbox = [];
  const incoming = state.fdata.friendships.filter((f) => f.status === 'pending' && f.incoming);
  if (incoming.length) {
    inbox.push(el('div', { class: 'card pending-card' }, el('h3', { text: `🤝 בקשות חברות (${incoming.length})` }),
      incoming.map((f) => {
        const p = state.fdata.people[f.other];
        return el('div', { class: 'row' },
          el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p ? p.avatar : '🙂' }),
          el('div', { class: 'text', text: `${p ? p.name : 'מישהו'} רוצה להוסיף אותך` }),
          el('div', { class: 'acts' },
            el('button', {
              class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
                try { await call('friends:respondFriend', { token: state.token, friendshipId: f.id, accept: true }); toast('חבר/ה נוספו ✅'); }
                catch (err) { toast(errMsg(err)); }
              },
            }),
            el('button', {
              class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
                try { await call('friends:respondFriend', { token: state.token, friendshipId: f.id, accept: false }); toast('הבקשה נדחתה'); }
                catch (err) { toast(errMsg(err)); }
              },
            })));
      })));
  }
  const waiting = entries.filter((e) => isPending(e) && e.createdBy !== me);
  if (waiting.length) {
    inbox.push(el('div', { class: 'card pending-card' }, el('h3', { text: `⏳ ממתין לאישור שלך (${waiting.length})` }),
      [...waiting].sort((x, y) => x.createdAt - y.createdAt).map((e) => el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', { text: `${nameOf(e.createdBy)} רשם/ה: ${subjectWord(e.from)} ${e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ${toWord(e.to)}` }),
          el('div', { class: 'meta', text: [money(e.amount), fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
        el('div', { class: 'acts' },
          el('button', {
            class: 'small okbtn', type: 'button', text: '✅ נכון', onclick: async () => {
              try { await call('friends:confirmEntry', { token: state.token, id: e.id }); toast('אושר ✅'); }
              catch (err) { toast(errMsg(err)); }
            },
          }),
          el('button', {
            class: 'small danger', type: 'button', text: 'לא נכון', onclick: async () => {
              if (!confirm('לדחות? הרישום יימחק.')) return;
              try { await call('friends:rejectEntry', { token: state.token, id: e.id }); toast('הרישום נדחה'); }
              catch (err) { toast(errMsg(err)); }
            },
          }))))));
  }
  $('friendsInbox').replaceChildren(...inbox);

  $('myFriendEmail').textContent = state.fdata.email || '';
  renderEntries($('friendHistory'), entries, 'עוד לא נרשם כלום עם חברים.', {
    removeEndpoint: 'friends:removeEntry',
    debtList: entries,
    pendingLabel: (e) => (e.createdBy === me ? '⏳ ממתין לחבר/ה' : '⏳ ממתין לאישור שלך'),
  });
}

$('friendsRequestBtn').addEventListener('click', withBusy($('friendsRequestBtn'), async () => {
  try { await call('friends:requestAccess', { token: state.token }); toast('הבקשה נשלחה להורים ⏳'); }
  catch (e) { toast(errMsg(e)); }
}));
$('teenRequestBtn').addEventListener('click', withBusy($('teenRequestBtn'), async () => {
  try { await call('people:requestTeen', { token: state.token }); toast('הבקשה נשלחה להורים ⏳'); }
  catch (e) { toast(errMsg(e)); }
}));
$('btnFriendIOwe').addEventListener('click', () => startFriendFlow({ kind: 'debt', from: state.data.me.id }));
$('btnFriendOwesMe').addEventListener('click', () => startFriendFlow({ kind: 'debt', to: state.data.me.id }));
$('friendForm').addEventListener('submit', withBusy($('friendForm').querySelector('button[type=submit]'), async (ev) => {
  ev.preventDefault();
  const err = $('friendError');
  err.hidden = true;
  try {
    await call('friends:addFriend', { token: state.token, email: $('friendEmailInput').value });
    $('friendEmailInput').value = '';
    toast('אם לחבר/ה יש מצב חברים, נשלחה להם בקשה 🤝');
  } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
}));

