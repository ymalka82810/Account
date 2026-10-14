import { useState } from 'react';
import { state } from '../../src/state.js';
import { call } from '../../src/api.js';
import { toast, errMsg } from '../../src/helpers.js';
import { setToken } from '../../src/session.js';
import { codeGone } from '../../src/screens/auth.js';
import { useApp } from '../appContext.js';
import { useSheet, useSheetTitle } from './Sheet.jsx';
import AsyncButton from './AsyncButton.jsx';

// כל החלונות הקופצים של האתר (גרסת React של src/screens/emailAuth.js ושל
// חלונות שהיו מפוזרים ב-app.js, auth.js ו-pending.js). פותחים אותם עם
// sheet.open(כותרת, <Component />).

const codeProps = { type: 'text', inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code', placeholder: '6 ספרות', dir: 'ltr' };
const pinProps = (ac) => ({ type: 'password', inputMode: 'numeric', maxLength: 4, autoComplete: ac });
const Err = ({ children }) => <p className="error" role="alert">{children}</p>;
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;

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

// הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
export function FriendApproveSheet({ person: p }) {
  const sheet = useSheet();
  const [email, setEmail] = useState(p.friendEmail || '');
  const [err, setErr] = useState('');
  useSheetTitle('מצב חברים ל' + p.name);
  return (
    <div className="form">
      <p className="hint">{p.name} יוכל/תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.</p>
      <Field label={`המייל של ${p.name}`}>
        <input type="email" dir="ltr" autoComplete="off" placeholder="name@example.com" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <p className="hint">חברים מוסיפים את הנער/ה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.</p>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        try {
          await call('friends:approveAccess', { token: state.token, personId: p.id, email });
          sheet.close();
          toast('מצב חברים אושר ✅');
        } catch (e) { setErr(errMsg(e)); }
      }}>אישור מצב חברים</AsyncButton>
    </div>
  );
}
