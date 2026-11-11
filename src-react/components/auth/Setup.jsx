import Arrow from '../shared/Arrow.jsx';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { PARENT_AVATARS } from '../../state/state.js';
import { backFromFamily, createFamily } from '../../state/auth.js';
import { In, Terms, randomAvatar, useBusy } from './parts.jsx';
import LocalePicker from '../shared/LocalePicker.jsx';
import { deviceCountry, localeFor } from '../../lib/currencies.js';
import { today } from '../../lib/helpers.js';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';
import { SETUP_DRAFT_KEY, loadDraft, saveDraft, clearDraft } from '../../lib/draft.js';
import { useNotebook, isAdult, parseBirth } from '../../lib/notebook.js';
import FamilyNameField, { buildFamilyName } from '../shared/FamilyNameField.jsx';
import DatePicker from '../shared/DatePicker.jsx';
import { PasswordInput } from '../shared/fields.jsx';

// הטופס נבנה מחדש בכל כניסה למסך (המסכים תמיד ב-DOM), כדי שלא יישארו בו פרטים מהקמה קודמת.
export default function Setup({ current }) {
  const [round, setRound] = useState(0);
  const was = useRef(current);
  useEffect(() => {
    if (was.current === 'setup' && current !== 'setup') setRound((r) => r + 1);
    was.current = current;
  }, [current]);
  return <SetupForm key={round} current={current} />;
}

function SetupForm({ current }) {
  const nb = useNotebook();
  // טיוטה (ראו lib/draft.js): רק שם המשפחה והשם. תאריך הלידה, הקוד הסודי והמייל לא נשמרים לעולם.
  const [draft] = useState(() => loadDraft(SETUP_DRAFT_KEY) || {});
  const [v, setV] = useState({ familyName: String(draft.familyName || '').slice(0, 30), name: String(draft.name || '').slice(0, 20), pin: '' });
  // אם כבר הוזן תאריך לידה בפנקס האישי, משתמשים בו.
  const [birthDate, setBirthDate] = useState(nb.birthDate || '');
  useEffect(() => { saveDraft(SETUP_DRAFT_KEY, { familyName: v.familyName, name: v.name }); }, [v.familyName, v.name]);
  // יציאה מהמסך (חזרה, או הקמה שהצליחה) סוגרת את הטופס, ואיתו הטיוטה. רענון הדף לא מריץ את זה, ולכן הטיוטה שורדת אותו.
  useEffect(() => () => clearDraft(SETUP_DRAFT_KEY), []);
  // דמות אקראית, בלי צורת פנייה, והמדינה לפי המכשיר. את כולם אפשר לשנות אחר כך.
  const [avatar] = useState(() => randomAvatar(PARENT_AVATARS));
  const [locale, setLocale] = useState(() => { const c = deviceCountry(); return c ? localeFor(c) : null; });
  const [error, setError] = useState('');
  const [bad, setBad] = useState(''); // השדה השגוי הראשון: familyName | name | birth | locale | pin | terms
  const [busy, run] = useBusy();
  const formRef = useRef(null);
  const errRef = useRef(null);
  const clearErr = () => { setError(''); setBad(''); };
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); clearErr(); };
  // שגיאה גלויה בשפת הממשק (בלי הודעת הדפדפן): מסמנים את השדה, מעבירים אליו פוקוס וגוללים להודעה, כמו בפנקס
  const fail = (msg, field) => {
    setError(msg); setBad(field);
    const box = formRef.current && formRef.current.querySelector('[data-f="' + field + '"]');
    const el = box && (box.matches('input, button') ? box : box.querySelector('input, button'));
    if (el) el.focus();
    setTimeout(() => errRef.current && errRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  };
  const submit = (ev) => {
    ev.preventDefault();
    clearErr();
    if (!v.familyName.trim()) return fail(t('כתבו את שם המשפחה'), 'familyName');
    if (!v.name.trim()) return fail(t('כתבו איך קוראים לך'), 'name');
    if (!parseBirth(birthDate)) return fail(t('תאריך לידה לא תקין'), 'birth');
    if (!isAdult(birthDate)) return fail(t('קופה משפחתית נפתחת רק על ידי מי שמעל גיל 18'), 'birth');
    if (!locale) return fail(t('בחרו איפה אתם גרים'), 'locale');
    if (!pinOk(v.pin, 'parent')) return fail(t('הקוד הסודי לא תקין ({rule})', { rule: pinLabel('parent') }), 'pin');
    if (!formRef.current.querySelector('[data-f="terms"] input').checked) return fail(t('צריך לאשר את תנאי השימוש ומדיניות הפרטיות'), 'terms');
    run(async () => {
      const { familyName, ...rest } = v;
      const err = await createFamily({ ...rest, familyName: buildFamilyName(familyName), birthDate, avatar, ...locale });
      if (err) { setError(err); return; }
      setV((x) => ({ ...x, pin: '' }));
    });
  };
  return (
    <In screen="setup" current={current}>
      <button className="ghost back" type="button" onClick={backFromFamily}><Arrow kind="back" /> {t('חזרה')}</button>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🏠</div>
        <h1>{t('הקמת קופה משפחתית')}</h1>
        <p className="hint">{t('להורים בלבד. מי שמקים הוא ההורה הראשון. אחר כך מקבלים קוד הצטרפות אחד לכל המשפחה, וקובעים לכל אחד/ת תפקיד: ילד/ה, נער/ה או הורה.')}</p>
        <form className="form" autoComplete="off" noValidate ref={formRef} onSubmit={submit}>
          <label className="field" data-f="familyName"><span>{t('שם המשפחה')}</span>
            <FamilyNameField invalid={bad === 'familyName'} value={v.familyName} onChange={(x) => { setV((o) => ({ ...o, familyName: x })); clearErr(); }} /></label>
          <label className="field" data-f="name"><span>{t('איך קוראים לך?')}</span>
            <input type="text" maxLength={20} required aria-invalid={bad === 'name' || undefined} className={bad === 'name' ? 'invalid' : undefined} value={v.name} onChange={set('name')} /></label>
          <label className="field" data-f="birth"><span>{t('תאריך לידה')}</span>
            <DatePicker title={t('תאריך לידה')} fallbackYearsAgo={30} max={today()} value={birthDate} onChange={(d) => { setBirthDate(d); clearErr(); }} />
            <small className="hint">{t('רק כדי לוודא שמקימ/ת הקופה מעל גיל 18. לא מוצג לאף אחד.')}</small></label>
          <div className="field" data-f="locale"><span>{t('איפה אתם גרים?')}</span><LocalePicker value={locale} onChange={(l) => { setLocale(l); clearErr(); }} /></div>
          <label className="field" data-f="pin"><span>{t('קוד סודי ({rule}; ארוך יותר = מוגן יותר)', { rule: pinLabel('parent') })}</span>
            <PasswordInput inputMode="numeric" pattern="\d{4,8}" maxLength={pinMax('parent')} required autoComplete="new-password"
              aria-invalid={bad === 'pin' || undefined} className={bad === 'pin' ? 'invalid' : undefined} value={v.pin} onChange={set('pin')} />
            <small className="hint">{t('זה הקוד שתשתמשו בו בכל כניסה. כדאי לזכור אותו.')}</small></label>
          <label className="check" data-f="terms"><input type="checkbox" required aria-invalid={bad === 'terms' || undefined} onChange={clearErr} /><Terms /></label>
          {error && <p className="error" role="alert" ref={errRef}>{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('⏳ רגע…') : t('הקמת הקופה')}</button>
        </form>
      </div>
    </In>
  );
}
