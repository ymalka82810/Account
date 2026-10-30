import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { goView, joinFamily, openNotebook } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

export default function Join({ current }) {
  const fam = state.fam;
  const [v, setV] = useState({ name: '', pin: '' });
  const [avatar, setAvatar] = useState(() => randomAvatar());
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const [sent, setSent] = useState(false);
  const [sentName, setSentName] = useState('');
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await joinFamily({ ...v, avatar });
      if (err && err.pending) { setSentName(v.name); setSent(true); }
      else if (err) setError(err);
      setV({ name: '', pin: '' });
    });
  };
  // הודעה מוכנה להורה בוואטסאפ, כמו תזכורת החוב (WhatsAppRemind): איש הקשר נבחר שם, ושום מספר לא נשמר.
  // הקישור הוא לאפליקציה בלבד, בלי קוד המשפחה: ההורה כבר מכיר אותו.
  const askParent = () => {
    const text = t('היי, {name} ביקש/ה להצטרף לקופה המשפחתית. אפשר להיכנס ולאשר: {url}', { name: sentName, url: location.origin + location.pathname });
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  if (sent) {
    return (
      <In screen="join" current={current}>
        <div className="card-narrow">
          <div className="big-emoji" aria-hidden="true">⏳</div>
          <h1>{t('הבקשה נשלחה')}</h1>
          <p className="hint">{fam ? t('ממתינים לאישור הורה ב{name}. אחרי שהורה יאשר, בוחרים את השם שלך במסך הכניסה ומקלידים את הקוד הסודי שבחרת.', { name: fam.name }) : t('ממתינים לאישור הורה. אחרי שהורה יאשר, בוחרים את השם שלך במסך הכניסה ומקלידים את הקוד הסודי שבחרת.')}</p>
          <button className="primary" type="button" onClick={askParent}>{t('💬 שלחו להורה בוואטסאפ')}</button>
          <p className="hint">{t('בינתיים אפשר לרשום בפנקס האישי, שנשמר במכשיר שלך.')}</p>
          <button className="ghost" type="button" onClick={openNotebook}>{t('📒 בינתיים, לפנקס האישי')}</button>
          <button className="ghost linkish" type="button" onClick={() => goView('welcome')}>{t('הבנתי')}</button>
        </div>
      </In>
    );
  }
  return (
    <In screen="join" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}>{t('→ חזרה')}</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">👋</div>
        <h1>{t('מצטרפים לקופה')}</h1>
        <p className="hint">
          {fam && t('מצטרפים לקופה של {name}. הורה במשפחה צריך לאשר את ההצטרפות ויקבע אם את/ה ילד/ה, נער/ה או הורה.', { name: fam.name })}
        </p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>{t('איך קוראים לך?')}</span>
            <input type="text" maxLength={20} required value={v.name} onChange={set('name')} /></label>
          <div className="field"><span>{t('בחר/י דמות')}</span>
            <AvatarPicker value={avatar} onChange={setAvatar} /></div>
          <label className="field"><span>{t('קוד סודי משלך (4 ספרות)')}</span>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} /></label>
          <label className="check"><input type="checkbox" required /><Terms extra={t('. ילדים מצטרפים בהסכמת הורה')} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('⏳ רגע…') : t('הצטרפות')}</button>
        </form>
      </div>
    </In>
  );
}
