import { call } from '../../lib/api.js';
import { useState } from 'react';
import { toast } from '../../lib/helpers.js';
import { useRun } from '../../lib/useRun.js';
import { FRIEND_MAX } from '../../state/state.js';
import { useApp } from '../../state/appContext.js';
import { isPending, pairOwes, openDebtsOf, debtLabel, namesFor, money, fmtDate } from '../../lib/computations.js';
import { g } from '../../lib/gender.js';
import EntriesList from '../entries/EntriesList.jsx';
import DebtLines from '../entries/DebtLines.jsx';

// מצב חברים לבני נוער.
export default function FriendsTab({ data, fdata, token }) {
  const { openEntryFlow } = useApp();
  const me = data.me.id;
  const [busy, setBusy] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const run = useRun(token);

  if (!fdata || fdata.kind !== 'teen') return null;

  async function busyRun(key, fn) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } finally { setBusy(''); }
  }

  if (!fdata.enabled) {
    return (
      <div className="card friends-lock">
        <div className="big-emoji" aria-hidden="true">🔒</div>
        <h3>מצב חברים</h3>
        <p className="hint">כאן רושמים חובות עם חברים: מי קנה למי, ומי צריך להחזיר. החבר/ה צריכים גם הם את האפליקציה, וההורים שלך צריכים לאשר.</p>
        <p className="hint">{fdata.requested ? 'הבקשה נשלחה להורים. נעדכן אותך כשיאשרו.' : ''}</p>
        {fdata.requested && <div className="badge-pending">⏳ ממתין לאישור ההורים</div>}
        {!fdata.requested && (
          <button className="primary" type="button" disabled={!!busy} aria-busy={busy === 'req'}
            onClick={() => busyRun('req', () => run('friends:requestAccess', {}, 'הבקשה נשלחה להורים ⏳'))}>
            {busy === 'req' ? '⏳ רגע…' : 'בקשת אישור מההורים'}
          </button>
        )}
      </div>
    );
  }

  const entries = fdata.entries;
  const lookup = (id) => data.people.find((p) => p.id === id) || fdata.people[id];
  const { nameOf, subjectWord, toWord, gw, vw } = namesFor(me, lookup);
  const accepted = fdata.friendships.filter((f) => f.status === 'accepted').length;
  const startFlow = (opts) => {
    if (!accepted) { toast('עוד אין חברים מאושרים. הוסיפו חבר/ה לפי המייל שלהם.'); return; }
    openEntryFlow({
      ...opts, entries: () => fdata.entries,
      people: fdata.friendships.filter((f) => f.status === 'accepted').map((f) => fdata.people[f.other]).filter(Boolean),
      endpoint: 'friends:addEntry', maxEntry: FRIEND_MAX, doneToast: 'נשלח לחבר/ה לאישור ⏳', returnTab: 'friends',
    });
  };
  const removeFriendship = (f, p) => {
    if (!confirm(`להסיר את ${p.name} מהחברים?`)) return;
    run('friends:removeFriend', { friendshipId: f.id }, 'החבר/ה הוסרו');
  };

  let owe = 0, get = 0;
  const cards = [];
  for (const f of fdata.friendships) {
    const p = fdata.people[f.other];
    if (!p) continue;
    if (f.status !== 'accepted') {
      if (f.incoming) continue; // בקשות נכנסות מוצגות בתיבה למעלה
      cards.push(
        <div className="debt" key={f.id}>
          <span className="avatar-md" aria-hidden="true">{p.avatar}</span>
          <div className="text">
            <div className="who">{p.name}</div>
            <div className="meta">⏳ ממתין שיאשרו את הבקשה</div>
          </div>
          <button className="small" type="button" onClick={() => removeFriendship(f, p)}>ביטול</button>
        </div>
      );
      continue;
    }
    const n = pairOwes(me, p.id, entries, 'ILS');
    const iOwe = n > 0;
    const amount = Math.abs(n);
    if (n > 0) owe += amount; else if (n < 0) get += amount;
    const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
    const open = n === 0 ? [] : openDebtsOf(dFrom, dTo, entries, 'ILS');
    cards.push(
      <div key={f.id} className={'debt' + (n === 0 ? '' : iOwe ? ' owe' : ' get') + (open.length > 1 ? ' multi' : '')}>
        <span className="avatar-md" aria-hidden="true">{p.avatar}</span>
        <div className="text">
          <div className="who">{n === 0 ? p.name : iOwe ? `${g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} ל${p.name}` : `${p.name} ${g(p.gender, 'חייב', 'חייבת', 'חייב/ת')} לי`}</div>
          <div className="amt">{n === 0 ? 'הכול מסודר ✅' : money(amount, 'ILS')}</div>
          <DebtLines open={open} iOwe={iOwe} onPay={(x) => startFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })} />
        </div>
        {n !== 0 && (
          <button className="small strongbtn" type="button"
            onClick={() => startFlow(iOwe ? { kind: 'payment', from: me, to: p.id, suggest: amount } : { kind: 'payment', from: p.id, to: me, suggest: amount })}>
            {iOwe ? '💰 שילמתי' : '💰 קיבלתי'}
          </button>
        )}
        <button className="small danger" type="button" aria-label={'הסרת ' + p.name} onClick={() => removeFriendship(f, p)}>הסרה</button>
      </div>
    );
  }

  const incoming = fdata.friendships.filter((f) => f.status === 'pending' && f.incoming);
  const waiting = entries.filter((e) => isPending(e) && e.createdBy !== me).sort((x, y) => x.createdAt - y.createdAt);

  async function addFriend(ev) {
    ev.preventDefault();
    setError('');
    await busyRun('add', async () => {
      try {
        await call('friends:addFriend', { token, email });
        setEmail('');
        toast('אם לחבר/ה יש מצב חברים, נשלחה להם בקשה 🤝');
      } catch (e) { setError(errMsg(e)); }
    });
  }

  return (
    <>
      <div className="summary">
        <div className="sum owe"><div className="lbl">{g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} לחברים</div><div className="num">{money(owe, 'ILS')}</div></div>
        <div className="sum get"><div className="lbl">חברים חייבים לי</div><div className="num">{money(get, 'ILS')}</div></div>
      </div>
      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => startFlow({ kind: 'debt', from: me })}>
          <span aria-hidden="true">💸</span>{g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')} לחבר/ה
        </button>
        <button className="bigbtn get" type="button" onClick={() => startFlow({ kind: 'debt', to: me })}>
          <span aria-hidden="true">🤝</span>חבר/ה חייב/ת לי
        </button>
      </div>

      <div>
        {incoming.length > 0 && (
          <div className="card pending-card">
            <h3>🤝 בקשות חברות ({incoming.length})</h3>
            {incoming.map((f) => {
              const p = fdata.people[f.other];
              return (
                <div className="row" key={f.id}>
                  <span className="avatar-md" aria-hidden="true">{p ? p.avatar : '🙂'}</span>
                  <div className="text">{p ? p.name : 'מישהו'} רוצה להוסיף אותך</div>
                  <div className="acts">
                    <button className="small okbtn" type="button"
                      onClick={() => run('friends:respondFriend', { friendshipId: f.id, accept: true }, 'חבר/ה נוספו ✅')}>✅ אישור</button>
                    <button className="small danger" type="button"
                      onClick={() => run('friends:respondFriend', { friendshipId: f.id, accept: false }, 'הבקשה נדחתה')}>דחייה</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {waiting.length > 0 && (
          <div className="card pending-card">
            <h3>⏳ ממתין לאישור שלך ({waiting.length})</h3>
            {waiting.map((e) => (
              <div className="row" key={e.id}>
                <div className="text">
                  <div>
                    {nameOf(e.createdBy)} {gw(e.createdBy, 'רשם', 'רשמה', 'רשם/ה')}: {subjectWord(e.from)}{' '}
                    {e.kind === 'debt' ? gw(e.from, 'חייב', 'חייבת', 'חייב/ת') : vw(e.from, 'החזרתי', 'החזיר', 'החזירה', 'החזיר/ה')} {toWord(e.to)}
                  </div>
                  <div className="meta">{[money(e.amount, 'ILS'), fmtDate(e.date), e.note].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="acts">
                  <button className="small okbtn" type="button"
                    onClick={() => run('friends:confirmEntry', { id: e.id }, 'אושר ✅')}>✅ נכון</button>
                  <button className="small danger" type="button" onClick={() => {
                    if (confirm('לדחות? הרישום יימחק.')) run('friends:rejectEntry', { id: e.id }, 'הרישום נדחה');
                  }}>לא נכון</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2>החברים שלי</h2>
      <div>
        {cards.length === 0
          ? <div className="empty"><div className="big-emoji" aria-hidden="true">🤝</div>עוד אין חברים. הוסיפו חבר/ה לפי המייל שלהם.</div>
          : cards}
      </div>

      <form className="form card" autoComplete="off" onSubmit={addFriend}>
        <h3>הוספת חבר/ה</h3>
        <p className="hint">כתבו את המייל שהחבר/ה רשמו אצל ההורים שלהם באפליקציה. נשלחת להם בקשה, והם צריכים לאשר. זה עובד רק אם גם לחבר/ה יש מצב חברים.</p>
        <label className="field"><span>המייל של החבר/ה</span>
          <input type="email" dir="ltr" maxLength={254} autoComplete="off" placeholder="name@example.com" required
            value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={!!busy}>{busy === 'add' ? '⏳ רגע…' : 'שליחת בקשה'}</button>
        <p className="hint">המייל שלך לחברים: <span dir="ltr">{fdata.email || ''}</span></p>
      </form>

      <h2>היסטוריה עם חברים</h2>
      <div>
        <EntriesList list={entries} emptyText="עוד לא נרשם כלום עם חברים." token={token} me={me} isParent={false} display="ILS"
          lookup={lookup} debtList={entries} removeEndpoint="friends:removeEntry"
          pendingLabel={(e) => (e.createdBy === me ? '⏳ ממתין לחבר/ה' : '⏳ ממתין לאישור שלך')} />
      </div>
    </>
  );
}
