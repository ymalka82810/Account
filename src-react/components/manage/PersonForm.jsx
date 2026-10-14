import { useState } from 'react';
import { call } from '../../lib/api.js';
import { state, PARENT_AVATARS } from '../../state/state.js';
import AvatarPicker, { randomAvatar } from '../shared/AvatarPicker.jsx';
import Select from '../shared/Select.jsx';
import { toast, errMsg } from '../../lib/helpers.js';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';

// הוספת בן/בת משפחה (הורים).
export default function PersonForm({ token }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('child');
  const [gender, setGender] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  function changeRole(newRole) {
    setRole(newRole);
    setAvatar(randomAvatar(newRole === 'parent' ? PARENT_AVATARS : undefined));
  }

  async function submit(ev) {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (pin && !/^\d{4}$/.test(pin)) { toast('הקוד צריך להיות 4 ספרות'); return; }
    setBusy(true);
    try {
      await call('people:add', { token: state.token || token, name: trimmed, role, avatar, gender: gender || undefined, pin: pin || undefined });
      setName(''); setPin('');
      toast(`${trimmed} ${g(gender, 'נוסף', 'נוספה', 'נוסף/ה')} למשפחה ✅`);
    } catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <form className="form card" autoComplete="off" onSubmit={submit}>
      <h3>הוספת בן/בת משפחה</h3>
      <label className="field"><span>שם</span>
        <input type="text" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="field"><span>תפקיד</span>
        <Select value={role} onChange={changeRole} options={[
          { value: 'child', label: g(gender, 'ילד', 'ילדה', 'ילד/ה') },
          { value: 'teen', label: g(gender, 'נער', 'נערה', 'נער/ה') },
          { value: 'parent', label: 'הורה' },
        ]} /></div>
      <div className="field"><span>צורת פנייה</span>
        <Select value={gender} onChange={setGender} options={GENDER_OPTIONS} /></div>
      <div className="field"><span>דמות</span>
        <AvatarPicker value={avatar} onChange={setAvatar} options={role === 'parent' ? PARENT_AVATARS : undefined} />
      </div>
      <label className="field"><span>קוד סודי (לא חובה — אפשר ש{g(gender, 'הילד', 'הילדה', 'הילד/ה')} {g(gender, 'יבחר', 'תבחר', 'יבחר/תבחר')} לבד)</span>
        <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="new-password"
          value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      <button className="primary" type="submit" disabled={busy}>הוספה</button>
    </form>
  );
}
