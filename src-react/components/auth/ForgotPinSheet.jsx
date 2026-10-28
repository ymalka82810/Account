import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { codeGone, route, setToken } from '../../state/auth.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';

// שכחתי קוד (הורה, במסך הכניסה): קוד למייל המאומת, ואז בוחרים קוד חדש ונכנסים.
export function ForgotPinSheet() {
  const sheet = useSheet();
  const f = state.pinFlow;
  const [step, setStep] = useState('send');
  const [emailCode, setEmailCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(step === 'send' ? t('שכחתי את הקוד') : t('קוד סודי חדש'));
  if (!f || f.legacy) return null;

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">{t('אם הוגדר מייל מאומת להורה הזה, נשלח אליו קוד אימות. אם לא הוגדר מייל, הורה אחר יכול לקבוע לך קוד חדש.')}</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try {
            const res = await call('emailAuth:requestResetCode', { code: state.fam.code, personId: f.person.id });
            if (res.ok) { setErr(''); setStep('reset'); return; }
            if (res.reason === 'code') { sheet.close(); codeGone(); return; }
            setErr(t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.'));
          } catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד למייל')}</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <Field label={t('הקוד מהמייל')}><input {...codeProps} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} /></Field>
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel('parent') })}><input {...pinProps('new-password', pinMax('parent'))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(newPin, 'parent')) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel('parent') })); return; }
        try {
          const res = await call('emailAuth:resetWithCode', { code: state.fam.code, personId: f.person.id, emailCode, newPin });
          if (res.ok) {
            sheet.close();
            // הורה שקשור למכשיר נכנס רק מהמכשיר שלו, ולכן אחרי האיפוס חוזרים למסך הקוד להיכנס עם הקוד החדש.
            if (!res.token) { toast(t('הקוד עודכן. היכנסו עם הקוד החדש מהמכשיר שלכם.')); state.pinFlow = null; route(); return; }
            state.pinFlow = null; setToken(res.token); return;
          }
          if (res.reason === 'code') { sheet.close(); codeGone(); return; }
          setErr(res.reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.') : t('קוד האימות שגוי או שפג תוקפו.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('קביעת הקוד והכניסה')}</AsyncButton>
    </div>
  );
}
