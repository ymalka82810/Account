import { useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { call } from '../../lib/api.js';
import { useApp } from '../../state/appContext.js';
import { state, AVATARS, PARENT_AVATARS } from '../../state/state.js';
import AvatarPicker, { randomAvatar } from '../shared/AvatarPicker.jsx';
import Select from '../shared/Select.jsx';
import { toast, errMsg } from '../../lib/helpers.js';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { BioError } from '../../lib/biometric.js';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';

// הוספת בן/בת משפחה (הורים).
export default function PersonForm() {
  const { data } = useApp();
  // השרת לא מרשה שתי דמויות זהות במשפחה, לכן כל הוספה מקבלת דמות פנויה (justUsed מכסה הוספה שעוד לא התעדכנה ברשימה).
  const freeAvatar = (forRole, justUsed) => {
    const options = forRole === 'parent' ? PARENT_AVATARS : AVATARS;
    const taken = new Set([...data.people.map((p) => p.avatar), justUsed]);
    const free = options.filter((a) => !taken.has(a));
    return randomAvatar(free.length ? free : options);
  };
  const [name, setName] = useState('');
  const [role, setRole] = useState('child');
  const [gender, setGender] = useState('');
  const [avatar, setAvatar] = useState(() => freeAvatar('child'));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  // נעילה מיידית נגד שליחה כפולה: ה-busy של React מתעדכן רק ברינדור הבא.
  const sending = useRef(false);
  const bioConfirm = useBioConfirm();

  function changeRole(newRole) {
    setRole(newRole);
    setAvatar(freeAvatar(newRole));
  }

  async function submit(ev) {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || sending.current) return;
    if (pin && !pinOk(pin, role)) { toast(t('הקוד צריך להיות {rule}', { rule: pinLabel(role) })); return; }
    if (role === 'parent' && !pin) { toast(t('להורה חדש צריך לקבוע קוד סודי')); return; }
    sending.current = true;
    setBusy(true);
    try {
      // הוספה בתור נער/ה או הורה מאושרת בטביעת אצבע / זיהוי פנים, כמו שינוי תפקיד.
      const clean = trimmed.replace(/\s+/g, ' ');
      const proof = role === 'child' ? undefined : await bioConfirm(`add:${role}:${clean}`, { why: t('כדי שילד לא יהפוך את עצמו להורה, הוספה בתור נער/ה או הורה מאושרת על ידי הורה. תיפתח עכשיו בקשת אימות מהמכשיר.') });
      await call('people:add', { token: state.token, name: clean, role, avatar, gender: gender || undefined, pin: pin || undefined, proof });
      setName(''); setPin(''); setAvatar(freeAvatar(role, avatar));
      toast(g(gender, '{name} נוסף למשפחה ✅', '{name} נוספה למשפחה ✅', '{name} נוסף/ה למשפחה ✅', { name: trimmed }));
    } catch (e) { toast(e instanceof BioError ? e.message : errMsg(e)); }
    finally { sending.current = false; setBusy(false); }
  }

  return (
    <form className="form card" autoComplete="off" onSubmit={submit}>
      <h3>{t('הוספת בן/בת משפחה')}</h3>
      <label className="field"><span>{t('שם')}</span>
        <input type="text" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="field"><span>{t('תפקיד')}</span>
        <Select value={role} onChange={changeRole} options={[
          { value: 'child', label: g(gender, 'ילד', 'ילדה', 'ילד/ה') },
          { value: 'teen', label: g(gender, 'נער', 'נערה', 'נער/ה') },
          { value: 'parent', label: t('הורה') },
        ]} /></div>
      <div className="field"><span>{t('צורת פנייה')}</span>
        <Select value={gender} onChange={setGender} options={GENDER_OPTIONS} /></div>
      <div className="field"><span>{t('דמות')}</span>
        <AvatarPicker value={avatar} onChange={setAvatar} options={role === 'parent' ? PARENT_AVATARS : undefined} compact />
      </div>
      <label className="field"><span>{role === 'parent'
        ? t('קוד סודי (חובה להורה, {rule})', { rule: pinLabel('parent') })
        : t('קוד סודי (לא חובה — בלי קוד נכנסים בלחיצה, ואפשר לקבוע קוד אחר כך)')}</span>
        <input type="password" inputMode="numeric" pattern={role === 'parent' ? '\\d{4,8}' : '\\d{4}'} maxLength={pinMax(role)} autoComplete="new-password"
          value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      {role !== 'child' && <p className="hint">{t('🔒 הוספה בתור {role} מאושרת בטביעת אצבע או בזיהוי פנים.', { role: role === 'parent' ? t('הורה') : g(gender, 'נער', 'נערה', 'נער/ה') })}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? t('⏳ רגע…') : t('הוספה')}</button>
    </form>
  );
}
