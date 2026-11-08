import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import LanguagePicker from '../shared/LanguagePicker.jsx';
import PalettePicker from '../shared/PalettePicker.jsx';
import Arrow from '../shared/Arrow.jsx';
import FeelSettings from './FeelSettings.jsx';
import { call } from '../../lib/api.js';
import { state, CODE_KEY } from '../../state/state.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession, goToFamily, otherFamilies, addAnotherFamily, startNewFamily } from '../../state/auth.js';
import { getMemberships } from '../../lib/memberships.js';
import { getCards, upsertCard } from '../../lib/cards.js';
import { pushSupported, isPushOn, enablePush, disablePush, releasePushDevice } from '../../lib/push.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import { ChangePinSheet, ChangePinEmailSheet, EmailSheet, AvatarSheet } from './AccountSheets.jsx';
import { DeviceSheet } from './DeviceSheet.jsx';
import NotebookSharing from './NotebookSharing.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import Select from '../shared/Select.jsx';
import { GENDER_OPTIONS } from '../../lib/gender.js';
import { g } from '../../lib/gender.js';
import { withIcons } from '../shared/UiIcon.jsx';

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
      <PalettePicker value={me.palette} onPick={setPalette} label={t('צבעי המסך')} />
    </div>
  );
}

export async function logout() {
  await releasePushDevice();
  // אחרי היציאה חוזרים למסך הבחירה במשפחה שיצאנו ממנה, לפי הכרטיס שלה שנשאר במכשיר.
  // אם עוד אין כרטיס כזה (למשל הקמת משפחה חדשה), מקבלים אחד לפני היציאה.
  const m = getMemberships().find((x) => x.token === state.token);
  const saved = m && getCards().find((c) => c.familyId === m.familyId);
  if (saved) localStorage.setItem(CODE_KEY, saved.card);
  else if (!localStorage.getItem(CODE_KEY) || m) {
    try {
      const r = await call('auth:deviceCard', { token: state.token });
      if (r && r.ok && r.loginCode) {
        localStorage.setItem(CODE_KEY, r.loginCode);
        upsertCard({ familyId: String(r.familyId), name: r.familyName, card: r.loginCode });
      }
    } catch (e) { /* ignore */ }
  }
  try { await call('auth:logout', { token: state.token }); } catch (e) { /* ignore */ }
  state.exiting = true;
  dropSession();
}

// "החשבון שלי": ההגדרות האישיות של מי שמחובר, בקבוצות עם כותרות: פרופיל, אבטחה, תחושה ומשפחות נוספות (סגור), ו"יציאה" בנפרד בתחתית.
export function AccountSheet() {
  const { data, token } = useApp();
  const sheet = useSheet();
  const me = data.me;
  const [pushOn, setPushOn] = useState(null);
  useSheetTitle(t('החשבון שלי'));

  useEffect(() => { if (pushSupported()) isPushOn().then(setPushOn); }, []);

  async function setGender(gender) {
    if (!gender) return;
    try { await call('people:setGender', { token, id: me.id, gender }); toast(t('צורת הפנייה נשמרה ✅')); }
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

  const row = (label, onClick) => (
    <button className="acct-row" type="button" onClick={onClick}><span>{label}</span><Arrow kind="chev-next" /></button>
  );
  const others = otherFamilies(data.family.id);

  return (
    <div className="form acct">
      <section className="acct-group" aria-labelledby="acct-h-profile">
        <h3 className="acct-h" id="acct-h-profile">{t('פרופיל')}</h3>
        {row(me.avatar ? me.avatar + ' ' + t('דמות') : withIcons(t('🙂 בחירת דמות')), () => sheet.open(t('דמות'), <AvatarSheet />))}
        <div className="field"><span>{t('צורת פנייה')}</span>
          {genderField}</div>
        <LanguagePicker />
        {me.role === 'teen' && row(withIcons(t('🎨 צבעי המסך')), () => sheet.open(t('צבעי המסך'), <PaletteSheet />))}
      </section>

      <section className="acct-group" aria-labelledby="acct-h-security">
        <h3 className="acct-h" id="acct-h-security">{t('אבטחה')}</h3>
        {row(withIcons(me.hasPin ? t('🔑 שינוי הקוד הסודי') : t('🔑 קביעת קוד סודי')),
          () => sheet.open(me.hasPin ? t('שינוי הקוד הסודי') : t('קביעת קוד סודי'), me.email ? <ChangePinEmailSheet /> : <ChangePinSheet />))}
        {me.role === 'parent' && row(withIcons(me.email ? t('✉️ מייל לשחזור: {email}', { email: me.email }) : t('✉️ הוספת מייל לשחזור קוד')),
          () => sheet.open('', <EmailSheet />))}
        {me.role === 'parent' && row(withIcons(t('📱 המכשירים שלי')), () => sheet.open(t('המכשירים שלי'), <DeviceSheet />))}
        {me.role === 'child' && me.notebookShared && row(withIcons(t('👁️ מי רואה את הפנקס שלי')), () => sheet.open(t('👁️ מי רואה את הפנקס שלי'), <NotebookSharing />))}
      </section>

      <section className="acct-group" aria-labelledby="acct-h-feel">
        <h3 className="acct-h" id="acct-h-feel">{t('תחושה')}</h3>
        {pushSupported() && pushOn !== null && (
          <AsyncButton className="acct-row" onClick={async () => {
            if (pushOn) await disablePush(); else await enablePush();
            setPushOn(await isPushOn());
          }}><span>{withIcons(pushOn ? t('🔕 כיבוי התראות') : t('🔔 הפעלת התראות'))}</span></AsyncButton>
        )}
        <FeelSettings />
      </section>

      {/* משפחות נוספות: מעבר, הצטרפות ויצירה. סגור כברירת מחדל, כי רוב האנשים משתמשים בהן פעם בחיים */}
      <details className="acct-more">
        <summary><span>{t('משפחות נוספות')}</span><Arrow kind="chev-next" /></summary>
        <div className="acct-more-body">
          {others.map((f) => (
            <button key={f.familyId} className="acct-row" type="button"
              onClick={async () => { const err = await goToFamily(f); if (err) toast(err); else sheet.close(); }}>
              <span>{withIcons(t('🏠 מעבר למשפחת {family}', { family: f.name }))}</span>
            </button>
          ))}
          <button className="acct-row" type="button" onClick={() => { sheet.close(); addAnotherFamily(); }}>
            <span>{withIcons(t('➕ הצטרפות למשפחה נוספת'))}</span>
          </button>
          {me.role === 'parent' && (
            <button className="acct-row" type="button" onClick={() => { sheet.close(); startNewFamily(); }}>
              <span>{withIcons(t('🏠 יצירת קופה משפחתית'))}</span>
            </button>
          )}
        </div>
      </details>

      <AsyncButton className="acct-exit" onClick={async () => { sheet.close(); await logout(); }}>{t('יציאה')}</AsyncButton>

      <p className="legal"><a href="terms.html">{t('תנאי שימוש')}</a> · <a href="privacy.html">{t('מדיניות פרטיות')}</a></p>
    </div>
  );
}
