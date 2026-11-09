import Arrow from '../shared/Arrow.jsx';
import { useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { goView, joinFamily } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';
import { pinOk } from '../../lib/pin.js';
import { PasswordInput } from '../shared/fields.jsx';
import JoinWait from './JoinWait.jsx';
import { getJoinPending } from '../../lib/joinPending.js';

export default function Join({ current }) {
  const fam = state.fam;
  const [v, setV] = useState({ name: '', pin: '' });
  const [avatar, setAvatar] = useState(() => randomAvatar());
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const [pending, setPending] = useState(getJoinPending); // בקשה פתוחה שנשמרה במכשיר (גם אחרי רענון)
  const [shareNb, setShareNb] = useState(false);
  const [terms, setTerms] = useState(false);
  const [bad, setBad] = useState(''); // השדה השגוי הראשון: name | pin | share | terms
  const formRef = useRef(null);
  const errRef = useRef(null);
  const clearErr = () => { setError(''); setBad(''); };
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); clearErr(); };
  // שגיאה גלויה בעיצוב האפליקציה (לא בועת הדפדפן, שנדחסת בצד המסך): מסמנים את השדה ומעבירים אליו פוקוס
  const fail = (msg, field) => {
    setError(msg); setBad(field);
    const box = formRef.current && formRef.current.querySelector('[data-f="' + field + '"]');
    const el = box && (box.matches('input, button') ? box : box.querySelector('input, button'));
    if (el) el.focus();
    setTimeout(() => errRef.current && errRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  };
  const submit = (ev) => {
    ev.preventDefault();
    clearErr();
    if (!v.name.trim()) return fail(t('כתבו איך קוראים לך'), 'name');
    if (!pinOk(v.pin, 'child')) return fail(t('הקוד הסודי צריך להיות בדיוק 4 ספרות'), 'pin');
    if (!shareNb) return fail(t('צריך לאשר שההורים יראו את הפנקס האישי שלך'), 'share');
    if (!terms) return fail(t('צריך לאשר את תנאי השימוש ומדיניות הפרטיות'), 'terms');
    run(async () => {
      const err = await joinFamily({ ...v, avatar });
      if (err && err.pending) setPending(getJoinPending());
      else if (err) setError(err);
      setV({ name: '', pin: '' });
    });
  };
  // הודעה מוכנה להורה בוואטסאפ, כמו תזכורת החוב (WhatsAppRemind): איש הקשר נבחר שם, ושום מספר לא נשמר.
  // הקישור הוא לאפליקציה בלבד, בלי קוד המשפחה: ההורה כבר מכיר אותו.
  const askParent = () => {
    const text = t('היי, {name} ביקש/ה להצטרף לקופה המשפחתית. אפשר להיכנס ולאשר: {url}', { name: pending ? pending.name : '', url: location.origin + location.pathname });
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  if (pending) {
    return (
      <In screen="join" current={current}>
        <JoinWait pending={pending} askParent={askParent} onNew={() => setPending(null)} />
      </In>
    );
  }
  return (
    <In screen="join" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}><Arrow kind="back" /> {t('חזרה')}</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">👋</div>
        <h1>{t('מצטרפים לקופה')}</h1>
        <p className="hint">
          {fam && t('מצטרפים לקופה של {name}. הורה במשפחה צריך לאשר את ההצטרפות ויקבע אם את/ה ילד/ה, נער/ה או הורה.', { name: fam.name })}
        </p>
        <form className="form" autoComplete="off" noValidate ref={formRef} onSubmit={submit}>
          <label className="field" data-f="name"><span>{t('איך קוראים לך?')}</span>
            <input type="text" maxLength={20} required aria-invalid={bad === 'name' || undefined} className={bad === 'name' ? 'invalid' : undefined} value={v.name} onChange={set('name')} /></label>
          <div className="field"><span>{t('בחר/י דמות')}</span>
            <AvatarPicker value={avatar} onChange={setAvatar} /></div>
          <label className="field" data-f="pin"><span>{t('קוד סודי משלך (4 ספרות)')}</span>
            <PasswordInput inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              aria-invalid={bad === 'pin' || undefined} className={bad === 'pin' ? 'invalid' : undefined} value={v.pin} onChange={set('pin')} /></label>
          <label className="check" data-f="share"><input type="checkbox" required aria-invalid={bad === 'share' || undefined} checked={shareNb} onChange={(e) => { setShareNb(e.target.checked); clearErr(); }} />
            <span>{t('אני מאשר/ת שההורים במשפחה יראו את מה שרשמתי בפנקס האישי שלי. הם יכולים רק לצפות, לא לשנות או למחוק.')}</span></label>
          <label className="check" data-f="terms"><input type="checkbox" required aria-invalid={bad === 'terms' || undefined} checked={terms} onChange={(e) => { setTerms(e.target.checked); clearErr(); }} /><Terms extra={t('. ילדים מצטרפים בהסכמת הורה')} /></label>
          {error && <p className="error" role="alert" ref={errRef}>{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('⏳ רגע…') : t('הצטרפות')}</button>
        </form>
      </div>
    </In>
  );
}
