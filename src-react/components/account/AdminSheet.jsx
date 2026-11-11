// לוח מנהל (זמני, לתקופת הפיתוח): כל המערכת ממקום אחד, בלי לעבור בין הורה לילד. קריאה בלבד.
// מופיע רק למי שחיבר חשבון גוגל שברשימת המנהלים (convex/superAdmin.ts). כלי פנימי, ולכן בעברית בלבד ובלי תרגום.
import { useState } from 'react';
import { useQuery } from '../../lib/api.js';
import { useApp } from '../../state/appContext.js';
import { useSheetTitle } from '../shared/Sheet.jsx';
import { fmtWhen } from '../../lib/when.js';
import Arrow from '../shared/Arrow.jsx';

const ROLE = { parent: 'הורה', teen: 'נער/ה', child: 'ילד/ה' };
const money = (amount, currency) => (amount / 100).toFixed(2) + ' ' + (currency || 'USD');

function PersonLine({ p }) {
  const tags = [
    ROLE[p.role],
    p.hasPin ? 'קוד ✓' : p.freeEntry ? 'בלי קוד' : 'בלי קוד עדיין',
    p.google ? 'גוגל: ' + p.google : null,
    p.devices ? 'מכשירים: ' + p.devices : null,
    p.locked ? '🔒 נעול' : null,
    p.friendsEnabled ? 'מצב חברים' : null,
    p.notebookShared ? 'פנקס משותף' : null,
  ].filter(Boolean);
  return (
    <div className="person">
      <div className="text">{p.avatar} {p.name}<div className="meta">{tags.join(' • ')}</div></div>
    </div>
  );
}

function EntryLine({ e }) {
  const flags = [e.pending && 'ממתין', e.archived && 'בארכיון', e.by && 'נרשם ע״י ' + e.by].filter(Boolean);
  return (
    <div className="person">
      <div className="text">
        {e.kind === 'debt' ? '🧾' : '💸'} {e.from} ← {e.to}: {money(e.amount, e.currency)}
        <div className="meta">{e.date}{e.note ? ' • ' + e.note : ''}{flags.length ? ' • ' + flags.join(' • ') : ''}</div>
      </div>
    </div>
  );
}

function FamilyDetail({ id, onBack }) {
  const { token } = useApp();
  const f = useQuery('superAdmin:family', { token, familyId: id });
  if (!f) return <p className="hint">⏳ רגע…</p>;
  return (
    <div className="form">
      <button className="ghost linkish" type="button" onClick={onBack}><Arrow kind="back" /> כל המשפחות</button>
      <h3 className="acct-h">🏠 {f.name}</h3>
      <p className="hint">קוד הצטרפות: <b dir="ltr">{f.code}</b> • {f.country || '?'} • {f.currency || 'USD'}</p>
      <h3 className="acct-h">אנשים ({f.people.length})</h3>
      {f.people.map((p) => <PersonLine key={p.id} p={p} />)}
      <h3 className="acct-h">רשומות ({f.entries.length})</h3>
      {f.entries.length ? f.entries.map((e) => <EntryLine key={e.id} e={e} />) : <p className="hint">אין</p>}
      {f.friendEntries.length > 0 && <>
        <h3 className="acct-h">חובות בין חברים ({f.friendEntries.length})</h3>
        {f.friendEntries.map((e) => <EntryLine key={e.id} e={e} />)}
      </>}
      {f.recurring.length > 0 && <>
        <h3 className="acct-h">דמי כיס קבועים</h3>
        {f.recurring.map((r) => <p className="hint" key={r.id}>{r.from} ← {r.to}: {money(r.amount, r.currency)} • {r.frequency === 'weekly' ? 'שבועי' : 'חודשי'} • הבא: {r.nextDate}</p>)}
      </>}
      {f.goals.length > 0 && <>
        <h3 className="acct-h">יעדי חיסכון</h3>
        {f.goals.map((g) => <p className="hint" key={g.id}>{g.person}: {g.name} ({money(g.target, g.currency)})</p>)}
      </>}
      {f.notebooks.length > 0 && <>
        <h3 className="acct-h">פנקסים משותפים</h3>
        {f.notebooks.map((n) => <p className="hint" key={n.person}>{n.person} • עודכן {fmtWhen(n.updatedAt)}</p>)}
      </>}
      <h3 className="acct-h">יומן שינויים</h3>
      {f.activity.length ? f.activity.map((a) => (
        <p className="hint" key={a.id}>{fmtWhen(a.at)} • {a.actor} • {a.kind}{a.subject ? ' • ' + a.subject : ''}{a.from ? ' • ' + a.from + ' ← ' + (a.to || '') : ''}{a.amount != null ? ' • ' + money(a.amount, a.currency) : ''}</p>
      )) : <p className="hint">ריק</p>}
    </div>
  );
}

export function AdminSheet() {
  const { token } = useApp();
  const data = useQuery('superAdmin:overview', { token });
  const [open, setOpen] = useState(null);
  useSheetTitle('לוח מנהל');
  if (open) return <FamilyDetail id={open} onBack={() => setOpen(null)} />;
  if (!data) return <p className="hint">⏳ רגע…</p>;
  const t = data.totals;
  return (
    <div className="form">
      <p className="hint">קריאה בלבד. {t.families} משפחות • {t.people} אנשים • {t.sessions} כניסות פעילות • {t.friendships} חברויות • {t.friendEntries} חובות בין חברים</p>
      {data.families.map((f) => (
        <button key={f.id} className="acct-row" type="button" onClick={() => setOpen(f.id)}>
          <span>
            🏠 {f.name} ({f.people.length})
            <span className="meta"> • {f.people.map((p) => p.name).join(', ')} • רשומות: {f.entries}{f.pending ? ' (ממתינות: ' + f.pending + ')' : ''}{f.joinRequests ? ' • בקשות הצטרפות: ' + f.joinRequests : ''}</span>
          </span>
          <Arrow kind="chev-next" />
        </button>
      ))}
      {data.orphans.length > 0 && <>
        <h3 className="acct-h">בלי משפחה</h3>
        {data.orphans.map((p) => <PersonLine key={p.id} p={p} />)}
      </>}
    </div>
  );
}
