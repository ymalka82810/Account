import { useState } from 'react';
import { state, PARENT_AVATARS } from '../../state/state.js';
import { goView, joinFamily } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';
import Select from '../shared/Select.jsx';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';

export default function Join({ current }) {
  const fam = state.fam;
  const isParentCode = fam && fam.codeRole === 'parent';
  const [v, setV] = useState({ name: '', pin: '' });
  const [avatar, setAvatar] = useState(() => randomAvatar(isParentCode ? PARENT_AVATARS : undefined));
  const [gender, setGender] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await joinFamily({ ...v, avatar, ...(isParentCode ? { gender: gender || undefined } : {}) });
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
          {isParentCode && (
            <div className="field"><span>צורת פנייה</span>
              <Select value={gender} onChange={setGender} options={GENDER_OPTIONS} /></div>
          )}
          <div className="field"><span>בחר/י דמות</span>
            <AvatarPicker value={avatar} onChange={setAvatar} options={isParentCode ? PARENT_AVATARS : undefined} /></div>
          <label className="field"><span>קוד סודי משלך (4 ספרות)</span>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} /></label>
          <label className="check"><input type="checkbox" required /><Terms gender={gender} extra=". ילדים מצטרפים בהסכמת הורה" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'הצטרפות'}</button>
        </form>
      </div>
    </In>
  );
}
