import { useState } from 'react';
import { state, PARENT_AVATARS } from '../../state/state.js';
import { goView, createFamily } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, useBusy } from './parts.jsx';

export default function Setup({ current }) {
  const [v, setV] = useState({ familyName: '', name: '', pin: '' });
  const [avatar, setAvatar] = useState(() => randomAvatar(PARENT_AVATARS));
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
          <div className="field"><span>בחר/י דמות</span><AvatarPicker value={avatar} onChange={setAvatar} options={PARENT_AVATARS} /></div>
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
