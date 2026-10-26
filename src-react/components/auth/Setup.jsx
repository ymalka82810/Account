import { useState } from 'react';
import { state, PARENT_AVATARS } from '../../state/state.js';
import { goView, createFamily } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, useBusy } from './parts.jsx';
import Select from '../shared/Select.jsx';
import LocalePicker from '../shared/LocalePicker.jsx';
import { GENDER_OPTIONS } from '../../lib/gender.js';
import { today } from '../../lib/helpers.js';
import { useNotebook, isAdult, parseBirth } from '../../lib/notebook.js';

export default function Setup({ current }) {
  const nb = useNotebook();
  const [v, setV] = useState({ familyName: '', name: '', pin: '' });
  // אם כבר הוזן תאריך לידה בפנקס האישי, משתמשים בו.
  const [birthDate, setBirthDate] = useState(nb.birthDate || '');
  const [avatar, setAvatar] = useState(() => randomAvatar(PARENT_AVATARS));
  const [gender, setGender] = useState('');
  const [locale, setLocale] = useState(null);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    if (!locale) { setError('בחרו איפה אתם גרים'); return; }
    if (!parseBirth(birthDate)) { setError('תאריך לידה לא תקין'); return; }
    if (!isAdult(birthDate)) { setError('קופה משפחתית נפתחת רק על ידי מי שמעל גיל 18'); return; }
    run(async () => {
      const err = await createFamily({ ...v, birthDate, avatar, gender: gender || undefined, ...locale });
      if (err) setError(err); else setV((x) => ({ ...x, pin: '' }));
    });
  };
  return (
    <In screen="setup" current={current}>
      <button className="ghost back" type="button" onClick={() => goView('welcome')}>→ חזרה</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🏠</div>
        <h1>הקמת קופה משפחתית</h1>
        <p className="hint">להורים בלבד. מי שמקים הוא ההורה הראשון. אחר כך מקבלים קוד הצטרפות אחד לכל המשפחה, וקובעים לכל אחד/ת תפקיד: ילד/ה, נער/ה או הורה.</p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>שם המשפחה</span>
            <input type="text" maxLength={30} placeholder="למשל: משפחת כהן" required value={v.familyName} onChange={set('familyName')} /></label>
          <label className="field"><span>איך קוראים לך?</span>
            <input type="text" maxLength={20} required value={v.name} onChange={set('name')} /></label>
          <label className="field"><span>תאריך לידה (רק מעל גיל 18 יכול/ה להקים קופה)</span>
            <input type="date" required max={today()} value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setError(''); }} /></label>
          <div className="field"><span>איפה אתם גרים?</span><LocalePicker value={locale} onChange={setLocale} /></div>
          <div className="field"><span>בחר/י דמות</span><AvatarPicker value={avatar} onChange={setAvatar} options={PARENT_AVATARS} /></div>
          <div className="field"><span>צורת פנייה</span>
            <Select value={gender} onChange={setGender} options={GENDER_OPTIONS} /></div>
          <label className="field"><span>קוד סודי (4 ספרות)</span>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} /></label>
          <label className="check"><input type="checkbox" required /><Terms gender={gender} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'הקמת הקופה'}</button>
        </form>
      </div>
    </In>
  );
}
