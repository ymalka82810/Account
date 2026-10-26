import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import LanguagePicker from '../shared/LanguagePicker.jsx';
import { call } from '../../lib/api.js';
import { state, CODE_KEY } from '../../state/state.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession } from '../../state/auth.js';
import { pushSupported, isPushOn, enablePush, disablePush, releasePushDevice } from '../../lib/push.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import { ChangePinSheet, ChangePinEmailSheet, EmailSheet, AvatarSheet } from './AccountSheets.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import Select from '../shared/Select.jsx';
import { GENDER_OPTIONS } from '../../lib/gender.js';
import { g } from '../../lib/gender.js';

// צבעי הניאון שנוער יכולים לבחור למסך שלהם.
const palettes = () => [
  { id: 'blue', label: t('כחול + סגול') },
  { id: 'green', label: t('ירוק + צהוב') },
  { id: 'orange', label: t('כתום + ורוד') },
];

function PaletteSheet() {
  const { data, token } = useApp();
  const sheet = useSheet();
  const me = data.me;
  useSheetTitle(t('צבעי המסך'));

  async function setPalette(palette) {
    try { await call('people:setPalette', { token, palette }); sheet.close(); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="form">
      <div className="palette-picks" role="radiogroup" aria-label={t('צבעי המסך')}>
        {palettes().map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={me.palette === p.id}
            className={'palette-pick' + (me.palette === p.id ? ' sel' : '')} data-pal={p.id}
            onClick={() => setPalette(p.id)}>
            <span className="palette-swatch" aria-hidden="true" />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export async function logout() {
  await releasePushDevice();
  // אם המכשיר לא שמר את המשפחה (למשל הקמת משפחה חדשה), מקבלים כרטיס כניסה לפני היציאה,
  // כדי שהיציאה תחזיר למסך הבחירה בין בני המשפחה ולא תזרוק מהמשפחה.
  if (!localStorage.getItem(CODE_KEY)) {
    try {
      const r = await call('auth:deviceCard', { token: state.token });
      if (r && r.ok && r.loginCode) localStorage.setItem(CODE_KEY, r.loginCode);
    } catch (e) { /* ignore */ }
  }
  try { await call('auth:logout', { token: state.token }); } catch (e) { /* ignore */ }
  state.exiting = true;
  dropSession();
}

// "החשבון שלי": ההגדרות האישיות של מי שמחובר (התראות, קוד סודי, מייל, בקשת נוער, יציאה).
export function AccountSheet() {
  const { data, token } = useApp();
  const sheet = useSheet();
  const me = data.me;
  const [pushOn, setPushOn] = useState(null);
  useSheetTitle(t('החשבון שלי'));

  useEffect(() => { if (pushSupported()) isPushOn().then(setPushOn); }, []);

  async function setGender(gender) {
    if (!gender) return;
    try { await call('people:setGender', { token, id: me.id, gender }); }
    catch (e) { toast(errMsg(e)); }
  }

  // צורת פנייה: הורה קובע לעצמו (פעם אחת בלבד - נעול אחרי קביעה).
  // לילד/נער זו קביעת הורה בלבד, דרך מסך ניהול בני המשפחה - לא כאן.
  const genderField = me.role === 'parent'
    ? (me.gender
        ? <span>{g(me.gender, 'זכר', 'נקבה')}</span>
        : <Select value="" onChange={setGender}
            options={[{ value: '', label: t('קביעת צורת פנייה…') }, ...GENDER_OPTIONS.filter((o) => o.value)]} />)
    : (me.gender ? <span>{g(me.gender, 'זכר', 'נקבה')}</span> : <span className="hint">{t('טרם נקבעה ע״י ההורה')}</span>);

  return (
    <div className="form">
      <div className="field"><span>{t('צורת פנייה')}</span>
        {genderField}</div>

      <LanguagePicker />

      <button className="ghost" type="button" onClick={() => sheet.open(t('דמות'), <AvatarSheet />)}>
        {me.avatar ? me.avatar + ' ' + t('דמות') : t('🙂 בחירת דמות')}
      </button>

      {me.role === 'teen' && (
        <button className="ghost" type="button" onClick={() => sheet.open(t('צבעי המסך'), <PaletteSheet />)}>
          {t('🎨 צבעי המסך')}
        </button>
      )}

      {pushSupported() && pushOn !== null && (
        <AsyncButton className="ghost" onClick={async () => {
          if (pushOn) await disablePush(); else await enablePush();
          setPushOn(await isPushOn());
        }}>{pushOn ? t('🔕 כיבוי התראות') : t('🔔 הפעלת התראות')}</AsyncButton>
      )}

      <button className="ghost" type="button"
        onClick={() => sheet.open(t('שינוי הקוד הסודי'), me.email ? <ChangePinEmailSheet /> : <ChangePinSheet />)}>
        {t('🔑 שינוי הקוד הסודי')}
      </button>

      {me.role === 'parent' && (
        <button className="ghost" type="button" onClick={() => sheet.open('', <EmailSheet />)}>
          {me.email ? t('✉️ מייל לשחזור: {email}', { email: me.email }) : t('✉️ הוספת מייל לשחזור קוד')}
        </button>
      )}

      <AsyncButton className="ghost" onClick={async () => { sheet.close(); await logout(); }}>{t('יציאה')}</AsyncButton>

      <p className="legal"><a href="terms.html">{t('תנאי שימוש')}</a> · <a href="privacy.html">{t('מדיניות פרטיות')}</a></p>
    </div>
  );
}
