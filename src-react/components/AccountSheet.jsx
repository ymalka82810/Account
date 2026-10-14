import { useEffect, useState } from 'react';
import { call } from '../../src/api.js';
import { state } from '../../src/state.js';
import { toast, errMsg } from '../../src/helpers.js';
import { dropSession } from '../../src/session.js';
import { pushSupported, isPushOn, enablePush, disablePush, releasePushDevice } from '../../src/push.js';
import { useApp } from '../appContext.js';
import { useSheet, useSheetTitle } from './Sheet.jsx';
import { ChangePinSheet, ChangePinEmailSheet, EmailSheet } from './account/AccountSheets.jsx';
import AsyncButton from './AsyncButton.jsx';

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

  return (
    <div className="form">
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
