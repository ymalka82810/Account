import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { state, AVATARS } from '../../src/state.js';
import { prettyCode } from '../../src/helpers.js';
import { subscribeAuth, authVersion } from '../../src/authStore.js';
import {
  submitFamilyCode, goView, createFamily, joinFamily, leaveFamily,
  startPin, pinBack, pressKey,
} from '../../src/screens/auth.js';
import { useSheet } from './Sheet.jsx';
import { ForgotPinSheet } from './Sheets.jsx';

// מסכי הכניסה (welcome / setup / login / join / pin). כולם תמיד ב-DOM, ורק
// זה שהוא ה-current מקבל את ה-class 'active' (ה-CSS מסתיר את השאר).
// ה-state המשותף (view, fam, pinFlow, legacyPeople) נשאר ב-state.js, וכל
// route() מודיע לכאן להתרנדר מחדש.
const CENTER = { login: true, pin: true };
function In({ screen, current, children }) {
  return (
    <section id={'screen-' + screen} className={'screen' + (CENTER[screen] ? ' center' : '') + (current === screen ? ' active' : '')}>
      {children}
    </section>
  );
}

const Terms = ({ extra }) => (
  <span>
    קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a> ול<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a>{extra}
  </span>
);

function AvatarPicker({ value, onChange }) {
  return (
    <div className="avatars">
      {AVATARS.map((a) => (
        <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
          aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
      ))}
    </div>
  );
}

const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

function Tile({ avatar, name, onClick }) {
  return (
    <button className="tile" type="button" onClick={onClick}>
      <span className="avatar-lg" aria-hidden="true">{avatar}</span>
      <span className="tname">{name}</span>
    </button>
  );
}

// כפתור שנועל את עצמו בזמן פעולה אסינכרונית (כמו withBusy).
function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  return [busy, run];
}

function Welcome({ current }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const parents = state.legacyPeople || [];
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await submitFamilyCode(code);
      if (err) setError(err); else setCode('');
    });
  };
  return (
    <In screen="welcome" current={current}>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🪙</div>
        <h1>הקופה המשפחתית</h1>
        <p className="hint">יש לכם קוד משפחה? כתבו אותו כאן. ילדים: בקשו מההורים את קוד הילדים.</p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>קוד משפחה</span>
            <input className="code-input" type="text" dir="ltr" maxLength={14} autoCapitalize="characters"
              autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="XXXXX-XXXXX" required
              value={code} onChange={(e) => { setCode(prettyCode(e.target.value)); setError(''); }} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'כניסה'}</button>
        </form>
        {parents.length > 0 && (
          <div className="card notice">
            <p><strong>כבר משתמשים בקופה?</strong> הורה נכנס כאן, ואז מקבלים קודים לשאר המשפחה.</p>
            <div className="tiles">
              {parents.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, true)} />)}
            </div>
          </div>
        )}
        <button className="ghost linkish" type="button" onClick={() => goView('setup')}>👨‍👩‍👧 אני הורה ורוצה להקים קופה חדשה</button>
        <p className="legal"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a></p>
      </div>
    </In>
  );
}

function Setup({ current }) {
  const [v, setV] = useState({ familyName: '', name: '', pin: '' });
  const [avatar, setAvatar] = useState(randomAvatar);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await createFamily({ ...v, avatar });
      if (err) setError(err); else setV((x) => ({ ...x, pin: '' }));
    });
  };
  return (
    <In screen="setup" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}>→ חזרה</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🏠</div>
        <h1>הקמת קופה משפחתית</h1>
        <p className="hint">להורים בלבד. מי שמקים הוא ההורה הראשון. אחר כך מקבלים קוד להורים וקוד לילדים, ומוסיפים את כולם.</p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>שם המשפחה</span>
            <input type="text" maxLength={30} placeholder="למשל: משפחת כהן" required value={v.familyName} onChange={set('familyName')} /></label>
          <label className="field"><span>איך קוראים לך?</span>
            <input type="text" maxLength={20} required value={v.name} onChange={set('name')} /></label>
          <div className="field"><span>בחר/י דמות</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
          <label className="field"><span>קוד סודי (4 ספרות)</span>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} /></label>
          <label className="check"><input type="checkbox" required /><Terms /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'הקמת הקופה'}</button>
        </form>
      </div>
    </In>
  );
}

function Login({ current }) {
  const fam = state.fam;
  return (
    <In screen="login" current={current}>
      <button className="ghost back" type="button" onClick={leaveFamily}>→ משפחה אחרת</button>
      <div className="big-emoji" aria-hidden="true">🪙</div>
      <h1>{fam ? fam.name : 'הקופה המשפחתית'}</h1>
      <p className="hint">מי נכנס/ת?</p>
      <div className="tiles">
        {fam && fam.people.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, false)} />)}
        <Tile avatar="➕" name="אני חדש/ה" onClick={() => goView('join')} />
      </div>
    </In>
  );
}

function Join({ current }) {
  const fam = state.fam;
  const [v, setV] = useState({ name: '', pin: '' });
  const [avatar, setAvatar] = useState(randomAvatar);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await joinFamily({ ...v, avatar });
      if (err) setError(err); else setV({ name: '', pin: '' });
    });
  };
  return (
    <In screen="join" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}>→ חזרה</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">👋</div>
        <h1>מצטרפים לקופה</h1>
        <p className="hint">
          {fam && (fam.codeRole === 'parent'
            ? `מצטרפים לקופה של ${fam.name} בתור הורה.`
            : `מצטרפים לקופה של ${fam.name} בתור ילד/ה.`)}
        </p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>איך קוראים לך?</span>
            <input type="text" maxLength={20} required value={v.name} onChange={set('name')} /></label>
          <div className="field"><span>בחר/י דמות</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
          <label className="field"><span>קוד סודי משלך (4 ספרות)</span>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} /></label>
          <label className="check"><input type="checkbox" required /><Terms extra=". ילדים מצטרפים בהסכמת הורה" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'הצטרפות'}</button>
        </form>
      </div>
    </In>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

function Pin({ current }) {
  const sheet = useSheet();
  const f = state.pinFlow;
  if (!f) return <In screen="pin" current={current} />;
  const title = f.mode === 'login'
    ? 'כתבו את הקוד הסודי'
    : f.first ? 'כתבו את הקוד שוב, לאישור' : 'בחרו קוד סודי חדש (4 ספרות)';
  return (
    <In screen="pin" current={current}>
      <button className="ghost back" type="button" onClick={pinBack}>→ חזרה</button>
      <div className="avatar-xl" aria-hidden="true">{f.person.avatar}</div>
      <h1>{f.person.name}</h1>
      <p className="hint">{title}</p>
      {/* key לפי מספר הרעידות: מרנדר מחדש את האלמנט ומפעיל שוב את האנימציה */}
      <div key={f.shakes} className={'dots' + (f.busy ? ' busy' : '') + (f.shakes ? ' shake' : '')} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={'dot' + (i < f.entered.length ? ' on' : '')} />)}
      </div>
      <p className="error" role="alert" aria-live="assertive">{f.busy ? 'בודקים…' : f.error}</p>
      <div className="pad">
        {KEYS.map((k, i) => (k === '' ? <span key={i} /> : (
          <button key={k} type="button" className={'key' + (k === 'del' ? ' del' : '')}
            aria-label={k === 'del' ? 'מחיקה' : k} onClick={() => pressKey(k)}>{k === 'del' ? '⌫' : k}</button>
        )))}
      </div>
      {f.mode === 'login' && f.person.role === 'parent' && !f.legacy && (
        <button className="ghost linkish" type="button" onClick={() => sheet.open('שכחתי את הקוד', <ForgotPinSheet />)}>שכחתי את הקוד</button>
      )}
    </In>
  );
}

export default function Auth({ current }) {
  useSyncExternalStore(subscribeAuth, authVersion);
  const currentRef = useRef(current);
  currentRef.current = current;

  // הקלדה במקלדת פיזית במסך הקוד הסודי.
  useEffect(() => {
    const onKey = (ev) => {
      if (!state.pinFlow || state.token || currentRef.current !== 'pin') return;
      if (/^\d$/.test(ev.key)) pressKey(ev.key);
      else if (ev.key === 'Backspace') pressKey('del');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Welcome current={current} />
      <Setup current={current} />
      <Login current={current} />
      <Join current={current} />
      <Pin current={current} />
    </>
  );
}
