import { useState } from 'react';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';
import { g } from '../../lib/gender.js';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';

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
    if (!emailRequired && !pinOk(myPin, 'parent')) { setErr('הקלידו את הקוד הסודי שלכם.'); return; }
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
      toast(newPin ? `הקוד של ${p.name} עודכן` : `${p.name} ${g(p.gender, 'יבחר', 'תבחר', 'יבחר/תבחר')} קוד חדש בכניסה הבאה`);
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="form">
      {emailRequired && <Field label="קוד אימות מהמייל"><input {...codeProps} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} /></Field>}
      {!emailRequired && <Field label="הקוד הסודי שלכם, לאישור"><input {...pinProps('current-password')} value={myPin} onChange={(e) => setMyPin(e.target.value)} /></Field>}
      <Field label={`קוד חדש (${pinLabel(p.role)})`}><input {...pinProps('new-password', pinMax(p.role))} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(pin, p.role)) { setErr(`הקוד צריך להיות ${pinLabel(p.role)}.`); return; }
        await run(pin);
      }}>קביעת הקוד</AsyncButton>
      <AsyncButton className="ghost" onClick={() => run(undefined)}>לאפס, ושיבחרו לבד בכניסה הבאה</AsyncButton>
    </div>
  );
}
