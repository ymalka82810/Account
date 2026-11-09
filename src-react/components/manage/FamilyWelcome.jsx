import Avatar from '../shared/Avatar.jsx';
import { useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { call } from '../../lib/api.js';
import { useApp } from '../../state/appContext.js';
import { state, AVATARS } from '../../state/state.js';
import { useSheet } from '../shared/Sheet.jsx';
import Select from '../shared/Select.jsx';
import Collapsible from '../shared/Collapsible.jsx';
import { pinProps, PasswordInput } from '../shared/fields.jsx';
import { roleLabel } from '../../lib/computations.js';
import { useNotebook } from '../../lib/notebook.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';
import { pinOk, pinLabel } from '../../lib/pin.js';
import PersonForm from './PersonForm.jsx';
import { NotebookMergeSheet, findNotebookMatches } from './NotebookMerge.jsx';

// הוספת ילדים בבת אחת, עם קוד סודי אחד זהה לכולם. את הקוד קובעים פעם אחת, עם הילד הראשון;
// כשההורה רוצה לתת לילד את המשתמש שלו, הוא מאפס לו את הקוד מלשונית "ניהול" והילד בוחר קוד משלו.
function ChildrenForm({ people }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  // נעילה מיידית נגד שליחה כפולה (Enter במקלדת + לחיצה על "הוספה" באותו רגע): ה-busy של React מתעדכן רק ברינדור הבא.
  const sending = useRef(false);
  // כל ילד מקבל דמות פנויה (השרת לא מרשה שתי דמויות זהות); הרשימה המקומית מכסה הוספות שעוד לא התעדכנו.
  const usedAvatars = useRef(new Set());
  // הקוד המשותף נקבע עם הילד הראשון שנוסף כאן; אחריו השדה נעלם ושאר הילדים מקבלים אותו קוד.
  const [shared, setShared] = useState(false);
  const [sharedPin, setSharedPin] = useState(false);

  const freeAvatar = () => {
    const taken = new Set([...people.map((p) => p.avatar), ...usedAvatars.current]);
    const free = AVATARS.filter((a) => !taken.has(a));
    return free.length ? free[Math.floor(Math.random() * free.length)] : undefined;
  };

  async function submit(ev) {
    ev.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean || sending.current) return;
    if (pin && !pinOk(pin, 'child')) { toast(t('הקוד צריך להיות {rule}', { rule: pinLabel('child') })); return; }
    sending.current = true;
    setBusy(true);
    try {
      const avatar = freeAvatar();
      await call('people:add', { token: state.token, name: clean, role: 'child', avatar, gender: gender || undefined, pin: pin || undefined });
      if (avatar) usedAvatars.current.add(avatar);
      toast(g(gender, '{name} נוסף למשפחה ✅', '{name} נוספה למשפחה ✅', '{name} נוסף/ה למשפחה ✅', { name: clean }));
      setName(''); setGender(''); setShared(true); setSharedPin(!!pin);
    } catch (e) { toast(errMsg(e)); }
    finally { sending.current = false; setBusy(false); }
  }

  return (
    <form className="form card" autoComplete="off" onSubmit={submit}>
      <h3>{t('הוספת ילד/ה')}</h3>
      <label className="field"><span>{t('שם')}</span>
        <input type="text" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="field"><span>{t('צורת פנייה')}</span>
        <Select value={gender} onChange={setGender} options={GENDER_OPTIONS} /></div>
      {shared
        ? <p className="hint">{sharedPin ? t('✅ כל הילדים נכנסים בינתיים עם אותו קוד סודי. אפשר להוסיף עוד ילדים.') : t('✅ כל הילדים נכנסים בינתיים בלי קוד סודי. אפשר להוסיף עוד ילדים.')}</p>
        : (
          <>
            <label className="field"><span>{t('קוד סודי אחד לכל הילדים ({rule}). אפשר להשאיר ריק', { rule: pinLabel('child') })}</span>
              <PasswordInput {...pinProps('new-password')} pattern="\d{4}" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
            <p className="hint">{t('בלי קוד, הילדים נכנסים בלחיצה, וכל ילד יכול לקבוע קוד משלו מתי שירצה. עם קוד, כל הילדים מקבלים אותו קוד, וכשתרצו לתת לכל ילד את המשתמש שלו תאפסו לו את הקוד מלשונית “ניהול”, והוא יבחר קוד משלו.')}</p>
          </>
        )}
      <button className="primary" type="submit" disabled={busy}>{busy ? t('⏳ רגע…') : t('הוספה')}</button>
    </form>
  );
}

// נפתח אוטומטית מיד אחרי הקמת משפחה: שואלים מי הילדים ומוסיפים אותם עכשיו, בלי לחפש איפה עושים את זה.
// בסיום, אם יש בפנקס האישי שמות שמתאימים לבני המשפחה, עוברים לשאלת האיחוד.
export default function FamilyWelcome() {
  const { data, me } = useApp();
  const nb = useNotebook();
  const sheet = useSheet();
  const others = data.people.filter((p) => p.id !== me);
  const done = () => {
    if (findNotebookMatches(nb, data.people, me).length) sheet.open(t('איחוד עם הפנקס'), <NotebookMergeSheet />);
    else sheet.close();
  };
  return (
    <div>
      <p className="hint">{t('הקופה נפתחה! כתבו את שמות הילדים. נער/ה או הורה נוסף אפשר להוסיף למטה, או אחר כך מלשונית “ניהול”.')}</p>
      {others.length > 0 && (
        <div className="list">
          {others.map((p) => (
            <div className="person" key={p.id}>
              {p.avatar && <Avatar value={p.avatar} className="avatar-md" />}
              <div className="text">{p.name} <span className="meta">{roleLabel(p.role, p.gender)}</span></div>
            </div>
          ))}
        </div>
      )}
      <ChildrenForm people={data.people} />
      <Collapsible title={t('להוסיף גם נער/ה או הורה נוסף')}>
        <PersonForm />
      </Collapsible>
      <button className="primary" type="button" onClick={done}>{others.length ? t('סיימתי') : t('אוסיף אחר כך')}</button>
    </div>
  );
}
