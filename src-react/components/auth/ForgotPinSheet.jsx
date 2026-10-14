import { useState } from 'react';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { codeGone, setToken } from '../../state/auth.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';

// שכחתי קוד (הורה, במסך הכניסה): קוד למייל המאומת, ואז בוחרים קוד חדש ונכנסים.
export function ForgotPinSheet() {
  const sheet = useSheet();
  const f = state.pinFlow;
  const [step, setStep] = useState('send');
  const [emailCode, setEmailCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(step === 'send' ? 'שכחתי את הקוד' : 'קוד סודי חדש');
  if (!f || f.legacy) return null;

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">אם הוגדר מייל מאומת להורה הזה, נשלח אליו קוד אימות. אם לא הוגדר מייל, הורה אחר יכול לקבוע לך קוד חדש.</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try {
            const res = await call('emailAuth:requestResetCode', { code: state.fam.code, personId: f.person.id });
            if (res.ok) { setErr(''); setStep('reset'); return; }
            if (res.reason === 'code') { sheet.close(); codeGone(); return; }
            setErr('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.');
          } catch (e) { setErr(errMsg(e)); }
        }}>שליחת קוד למייל</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <Field label="הקוד מהמייל"><input {...codeProps} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} /></Field>
      <Field label="קוד חדש (4 ספרות)"><input {...pinProps('new-password')} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!/^\d{4}$/.test(newPin)) { setErr('הקוד החדש צריך להיות 4 ספרות.'); return; }
        try {
          const res = await call('emailAuth:resetWithCode', { code: state.fam.code, personId: f.person.id, emailCode, newPin });
          if (res.ok) { state.pinFlow = null; sheet.close(); setToken(res.token); return; }
          if (res.reason === 'code') { sheet.close(); codeGone(); return; }
          setErr(res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.' : 'קוד האימות שגוי או שפג תוקפו.');
        } catch (e) { setErr(errMsg(e)); }
      }}>קביעת הקוד והכניסה</AsyncButton>
    </div>
  );
}
