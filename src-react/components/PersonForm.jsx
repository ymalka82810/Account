import { useState } from 'react';
import { call } from '../../src/api.js';
import { state } from '../../src/state.js';
import AvatarPicker, { randomAvatar } from './AvatarPicker.jsx';
import { toast, errMsg } from '../../src/helpers.js';

// הוספת בן/בת משפחה (הורים).
export default function PersonForm({ token }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('child');
  const [avatar, setAvatar] = useState(randomAvatar);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (pin && !/^\d{4}$/.test(pin)) { toast('הקוד צריך להיות 4 ספרות'); return; }
    setBusy(true);
    try {
      await call('people:add', { token: state.token || token, name: trimmed, role, avatar, pin: pin || undefined });
      setName(''); setPin('');
      toast(`${trimmed} נוסף/ה למשפחה ✅`);
    } catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <form className="form card" autoComplete="off" onSubmit={submit}>
      <h3>הוספת בן/בת משפחה</h3>
      <label className="field"><span>שם</span>
        <input type="text" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>תפקיד</span>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="child">ילד/ה</option><option value="teen">נער/ה</option><option value="parent">הורה</option>
        </select></label>
      <div className="field"><span>דמות</span>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      <label className="field"><span>קוד סודי (לא חובה — אפשר שהילד/ה יבחרו לבד)</span>
        <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="new-password"
          value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      <button className="primary" type="submit" disabled={busy}>הוספה</button>
    </form>
  );
}
