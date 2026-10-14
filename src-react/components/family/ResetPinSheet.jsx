import { useState } from 'react';
import { state } from '../../../src/state.js';
import { call } from '../../../src/api.js';
import { toast, errMsg } from '../../../src/helpers.js';
import { useApp } from '../../appContext.js';
import { useSheet, useSheetTitle } from '../Sheet.jsx';
import AsyncButton from '../AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../sheets/fields.jsx';

// הורה קובע קוד סודי חדש לילד/ה (אפשר גם לאפס שיבחרו לבד).
export function ResetPinSheet({ person: p }) {
  const { data } = useApp();
  const sheet = useSheet();
  const emailRequired = !!data.me.email;
  const [step, setStep] = useState(emailRequired ? 'send' : 'form');
  const [emailCode, setEmailCode] = useState('');
  const [myPin, setMyPin] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(step === 'send' ? 'אישור במייל' : 'קוד סודי ל' + p.name);

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">כדי לקבוע קוד חדש ל{p.name} נשלח קוד אימות ל-{data.me.email}.</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestChildResetCode', { token: state.token }); setErr(''); setStep('form'); }
          catch (e) { setErr(errMsg(e)); }
        }}>שליחת קוד למייל</AsyncButton>
      </div>
    );
  }

  const run = async (newPin) => {
    if (!emailRequired && !/^\d{4}$/.test(myPin)) { setErr('הקלידו את הקוד הסודי שלכם, 4 ספרות.'); return; }
    try {
      const res = await call('auth:resetPin', {
        token: state.token, personId: p.id, pin: newPin,
        emailCode: emailRequired ? emailCode : undefined,
        myPin: emailRequired ? undefined : myPin,
      });
      if (res && res.ok === false) {
        setErr(res.reason === 'wrongMyPin' ? 'הקוד הסודי שהקלדתם שגוי.'
          : res.reason === 'locked' ? 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.'
            : 'קוד האימות מהמייל שגוי או שפג תוקפו.');
        return;
      }
      sheet.close();
      toast(newPin ? `הקוד של ${p.name} עודכן` : `${p.name} יבחר/תבחר קוד חדש בכניסה הבאה`);
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="form">
      {emailRequired && <Field label="קוד אימות מהמייל"><input {...codeProps} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} /></Field>}
      {!emailRequired && <Field label="הקוד הסודי שלכם, לאישור"><input {...pinProps('current-password')} value={myPin} onChange={(e) => setMyPin(e.target.value)} /></Field>}
      <Field label="קוד חדש (4 ספרות)"><input {...pinProps('new-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!/^\d{4}$/.test(pin)) { setErr('הקוד צריך להיות 4 ספרות.'); return; }
        await run(pin);
      }}>קביעת הקוד</AsyncButton>
      <AsyncButton className="ghost" onClick={() => run(undefined)}>לאפס, ושיבחרו לבד בכניסה הבאה</AsyncButton>
    </div>
  );
}
