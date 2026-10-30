import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state, PARENT_AVATARS } from '../../state/state.js';
import { backFromFamily, createFamily } from '../../state/auth.js';
import { In, Terms, randomAvatar, useBusy } from './parts.jsx';
import LocalePicker from '../shared/LocalePicker.jsx';
import { deviceCountry, localeFor } from '../../lib/currencies.js';
import { today, toast, errMsg } from '../../lib/helpers.js';
import { call } from '../../lib/api.js';
import { useSheet } from '../shared/Sheet.jsx';
import { EmailSheet } from '../account/AccountSheets.jsx';
import { pinLabel, pinMax } from '../../lib/pin.js';
import { useNotebook, isAdult, parseBirth } from '../../lib/notebook.js';

export default function Setup({ current }) {
  const nb = useNotebook();
  const sheet = useSheet();
  const [v, setV] = useState({ familyName: '', name: '', pin: '', email: '' });
  // אם כבר הוזן תאריך לידה בפנקס האישי, משתמשים בו.
  const [birthDate, setBirthDate] = useState(nb.birthDate || '');
  // דמות אקראית, בלי צורת פנייה, והמדינה לפי המכשיר. את כולם אפשר לשנות אחר כך.
  const [avatar] = useState(() => randomAvatar(PARENT_AVATARS));
  const [locale, setLocale] = useState(() => { const c = deviceCountry(); return c ? localeFor(c) : null; });
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    if (!locale) { setError(t('בחרו איפה אתם גרים')); return; }
    if (!parseBirth(birthDate)) { setError(t('תאריך לידה לא תקין')); return; }
    if (!isAdult(birthDate)) { setError(t('קופה משפחתית נפתחת רק על ידי מי שמעל גיל 18')); return; }
    run(async () => {
      const { email, ...rest } = v;
      const err = await createFamily({ ...rest, birthDate, avatar, ...locale });
      if (err) { setError(err); return; }
      setV((x) => ({ ...x, pin: '' }));
      // מייל לשחזור (לא חובה): שולחים קוד אימות ופותחים ישר את שלב ההקלדה.
      const addr = email.trim();
      if (addr) {
        try {
          await call('emailAuth:requestVerify', { token: state.token, email: addr });
          sheet.open(t('אימות המייל'), <EmailSheet sentTo={addr.toLowerCase()} />);
        } catch (e) { toast(errMsg(e)); }
      }
    });
  };
  return (
    <In screen="setup" current={current}>
      <button className="ghost back" type="button" onClick={backFromFamily}>{t('→ חזרה')}</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🏠</div>
        <h1>{t('הקמת קופה משפחתית')}</h1>
        <p className="hint">{t('להורים בלבד. מי שמקים הוא ההורה הראשון. אחר כך מקבלים קוד הצטרפות אחד לכל המשפחה, וקובעים לכל אחד/ת תפקיד: ילד/ה, נער/ה או הורה.')}</p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>{t('שם המשפחה')}</span>
            <input type="text" maxLength={30} placeholder={t('למשל: משפחת כהן')} required value={v.familyName} onChange={set('familyName')} /></label>
          <label className="field"><span>{t('איך קוראים לך?')}</span>
            <input type="text" maxLength={20} required value={v.name} onChange={set('name')} /></label>
          <label className="field"><span>{t('תאריך לידה')}</span>
            <input type="date" required max={today()} value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setError(''); }} />
            <small className="hint">{t('רק כדי לוודא שמקימ/ת הקופה מעל גיל 18. לא מוצג לאף אחד.')}</small></label>
          <div className="field"><span>{t('איפה אתם גרים?')}</span><LocalePicker value={locale} onChange={setLocale} /></div>
          <label className="field"><span>{t('קוד סודי ({rule}; ארוך יותר = מוגן יותר)', { rule: pinLabel('parent') })}</span>
            <input type="password" inputMode="numeric" pattern="\d{4,8}" maxLength={pinMax('parent')} required autoComplete="new-password"
              value={v.pin} onChange={set('pin')} />
            <small className="hint">{t('זה הקוד שתשתמשו בו בכל כניסה. כדאי לזכור אותו.')}</small></label>
          <label className="field"><span>{t('מייל לשחזור הקוד (לא חובה)')}</span>
            <input type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" value={v.email} onChange={set('email')} />
            <small className="hint">{t('אם תשכחו את הקוד, נשלח אליו קוד לאיפוס. בלי מייל, רק הורה אחר יוכל לעזור.')}</small></label>
          <label className="check"><input type="checkbox" required /><Terms /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('⏳ רגע…') : t('הקמת הקופה')}</button>
        </form>
      </div>
    </In>
  );
}
