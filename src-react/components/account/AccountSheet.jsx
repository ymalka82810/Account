import { useEffect, useState } from 'react';
import { call } from '../../lib/api.js';
import { state } from '../../state/state.js';
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

export async function logout() {
  await releasePushDevice();
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
  useSheetTitle('החשבון שלי');

  useEffect(() => { if (pushSupported()) isPushOn().then(setPushOn); }, []);

  async function setGender(gender) {
    try { await call('people:setGender', { token, id: me.id, gender: gender || undefined }); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="form">
      <div className="field"><span>צורת פנייה</span>
        <Select value={me.gender || ''} onChange={setGender} options={GENDER_OPTIONS} /></div>

      <button className="ghost" type="button" onClick={() => sheet.open('דמות', <AvatarSheet />)}>
        {me.avatar ? me.avatar + ' דמות' : '🙂 בחירת דמות'}
      </button>

      {pushSupported() && pushOn !== null && (
        <AsyncButton className="ghost" onClick={async () => {
          if (pushOn) await disablePush(); else await enablePush();
          setPushOn(await isPushOn());
        }}>{pushOn ? '🔕 כיבוי התראות' : '🔔 הפעלת התראות'}</AsyncButton>
      )}

      <button className="ghost" type="button"
        onClick={() => sheet.open('שינוי הקוד הסודי', me.email ? <ChangePinEmailSheet /> : <ChangePinSheet />)}>
        🔑 שינוי הקוד הסודי
      </button>

      {me.role === 'parent' && (
        <button className="ghost" type="button" onClick={() => sheet.open('', <EmailSheet />)}>
          {me.email ? '✉️ מייל לשחזור: ' + me.email : '✉️ הוספת מייל לשחזור קוד'}
        </button>
      )}

      {me.role === 'child' && (
        me.teenRequested
          ? <p className="hint">הבקשה להפוך ל{g(me.gender, 'נער', 'נערה', 'נער/ה')} נשלחה, מחכה לאישור ההורים.</p>
          : <AsyncButton className="ghost" onClick={async () => {
            try { await call('people:requestTeen', { token }); toast('הבקשה נשלחה להורים'); sheet.close(); }
            catch (e) { toast(errMsg(e)); }
          }}>🧑 אני רוצה להפוך ל{g(me.gender, 'נער', 'נערה', 'נער/ה')}</AsyncButton>
      )}

      <AsyncButton className="ghost" onClick={async () => { sheet.close(); await logout(); }}>יציאה</AsyncButton>

      <p className="legal"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a></p>
    </div>
  );
}
