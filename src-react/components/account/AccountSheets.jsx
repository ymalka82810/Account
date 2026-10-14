// החלונות של החשבון האישי: מייל לשחזור ושינוי הקוד הסודי של עצמי.
import { useState } from 'react';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../appContext.js';
import { useSheet, useSheetTitle } from '../Sheet.jsx';
import AsyncButton from '../AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../sheets/fields.jsx';

// הוספה או החלפה של מייל להורה: כתובת, ואז קוד אימות שנשלח אליה.
export function EmailSheet() {
  const { data } = useApp();
  const sheet = useSheet();
  const current = data.me.email;
  // נקודת ההתחלה: בלי מייל, ישר לכתובת. עם מייל מאומת, קודם שולחים קוד למייל הישן.
  const [step, setStep] = useState(current ? 'start' : 'email');
  const [addr, setAddr] = useState('');
  const [email, setEmail] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(step === 'start' ? 'החלפת מייל' : step === 'email' ? 'מייל לשחזור הקוד' : 'אימות המייל');

  const go = (s) => { setErr(''); setStep(s); };

  if (step === 'start') {
    return (
      <div className="form">
        <p className="hint">המייל הנוכחי: {current}. להחלפה נשלח אליו קוד אישור.</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestEmailChangeCode', { token: state.token }); go('email'); }
          catch (e) { setErr(errMsg(e)); }
        }}>שליחת קוד למייל הנוכחי</AsyncButton>
      </div>
    );
  }
  if (step === 'email') {
    return (
      <div className="form">
        <p className="hint">{current
          ? `שלחנו קוד אל ${current}. כתבו אותו, ואת הכתובת החדשה. היא תחליף את הנוכחית רק אחרי אימות.`
          : 'נשלח אליו קוד כשמשנים או מאפסים קוד סודי, וגם התראה כשהקוד של מישהו במשפחה ננעל.'}</p>
        {current && <Field label="קוד מהמייל הנוכחי"><input {...codeProps} value={oldCode} onChange={(e) => setOldCode(e.target.value)} /></Field>}
        <Field label={'כתובת מייל' + (current ? ' חדשה' : '')}>
          <input type="email" autoComplete="email" placeholder="name@example.com" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          setErr('');
          try {
            const res = await call('emailAuth:requestVerify', { token: state.token, email, oldCode: current ? oldCode : undefined });
            if (res.ok) { setAddr(email.trim().toLowerCase()); go('code'); }
            else setErr('הקוד מהמייל הנוכחי שגוי או שפג תוקפו.');
          } catch (e) { setErr(errMsg(e)); }
        }}>שליחת קוד אימות</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <p className="hint">שלחנו קוד בן 6 ספרות אל {addr}. הוא תקף ל-10 דקות.</p>
      <Field label="הקוד מהמייל"><input {...codeProps} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        try {
          const res = await call('emailAuth:confirmEmail', { token: state.token, code });
          if (res.ok) { sheet.close(); toast('המייל אומת ✅'); }
          else setErr('הקוד שגוי או שפג תוקפו.');
        } catch (e) { setErr(errMsg(e)); }
      }}>אימות</AsyncButton>
      <button className="ghost" type="button" onClick={() => go(current ? 'start' : 'email')}>כתובת אחרת</button>
    </div>
  );
}

// שינוי הקוד הסודי של הורה עם מייל מאומת: קוד מהמייל במקום הקוד הנוכחי.
export function ChangePinEmailSheet() {
  const { data } = useApp();
  const sheet = useSheet();
  const [step, setStep] = useState('send');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle('שינוי הקוד הסודי');

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">לאישור נשלח קוד אימות ל-{data.me.email}.</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestChangeCode', { token: state.token }); setErr(''); setStep('form'); }
          catch (e) { setErr(errMsg(e)); }
        }}>שליחת קוד למייל</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <Field label="הקוד מהמייל"><input {...codeProps} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <Field label="קוד חדש (4 ספרות)"><input {...pinProps('new-password')} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!/^\d{4}$/.test(newPin)) { setErr('הקוד החדש צריך להיות 4 ספרות.'); return; }
        try {
          const res = await call('emailAuth:changePinWithCode', { token: state.token, code, newPin });
          if (res.ok) { sheet.close(); toast('הקוד שונה ✅'); }
          else setErr('קוד האימות שגוי או שפג תוקפו.');
        } catch (e) { setErr(errMsg(e)); }
      }}>שמירה</AsyncButton>
    </div>
  );
}

// שינוי הקוד הסודי שלי (בלי מייל מאומת): הקוד הנוכחי והקוד החדש.
export function ChangePinSheet() {
  const sheet = useSheet();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle('שינוי הקוד הסודי');
  return (
    <div className="form">
      <Field label="הקוד הנוכחי"><input {...pinProps('current-password')} value={oldPin} onChange={(e) => setOldPin(e.target.value)} /></Field>
      <Field label="קוד חדש (4 ספרות)"><input {...pinProps('new-password')} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!/^\d{4}$/.test(newPin)) { setErr('הקוד החדש צריך להיות 4 ספרות.'); return; }
        try {
          const res = await call('auth:changeMyPin', { token: state.token, oldPin, newPin });
          if (res.ok) { sheet.close(); toast('הקוד שונה ✅'); }
          else if (res.reason === 'wrong') setErr('הקוד הנוכחי לא נכון.');
          else if (res.reason === 'locked') setErr('יותר מדי ניסיונות. נסו שוב עוד דקה.');
          else if (res.reason === 'useEmail') sheet.open('שינוי הקוד הסודי', <ChangePinEmailSheet />);
          else setErr('משהו השתבש. נסו שוב.');
        } catch (e) { setErr(errMsg(e)); }
      }}>שמירה</AsyncButton>
    </div>
  );
}
