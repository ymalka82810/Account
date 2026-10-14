import { useState } from 'react';
import { state } from '../../../src/state.js';
import { goView, joinFamily } from '../../../src/screens/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

export default function Join({ current }) {
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
