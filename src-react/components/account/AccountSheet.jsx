import { useEffect, useState } from 'react';
import { call } from '../../lib/api.js';
import { state } from '../../state/state.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession } from '../../state/auth.js';
import { pushSupported, isPushOn, enablePush, disablePush, releasePushDevice } from '../../lib/push.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import { ChangePinSheet, ChangePinEmailSheet, EmailSheet } from './AccountSheets.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import AvatarPicker from '../shared/AvatarPicker.jsx';

export async function logout() {
  await releasePushDevice();
  try { await call('auth:logout', { token: state.token }); } catch (e) { /* ignore */ }
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

  async function setAvatar(avatar) {
    try { await call('people:setAvatar', { token, avatar }); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="form">
      {me.role === 'teen' && (
        <div className="field"><span>דמות</span>
          <AvatarPicker value={me.avatar} onChange={setAvatar} />
          {me.avatar && (
            <button className="ghost" type="button" onClick={() => setAvatar(undefined)}>🗑️ מחיקת הדמות</button>
          )}
        </div>
      )}

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
          ? <p className="hint">הבקשה להפוך לנער/ה נשלחה, מחכה לאישור ההורים.</p>
          : <AsyncButton className="ghost" onClick={async () => {
            try { await call('people:requestTeen', { token }); toast('הבקשה נשלחה להורים'); sheet.close(); }
            catch (e) { toast(errMsg(e)); }
          }}>🧑 אני רוצה להפוך לנער/ה</AsyncButton>
      )}

      <AsyncButton className="ghost" onClick={async () => { sheet.close(); await logout(); }}>יציאה</AsyncButton>

      <p className="legal"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a></p>
    </div>
  );
}
