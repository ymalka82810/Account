// החלונות של החשבון האישי: מייל לשחזור ושינוי הקוד הסודי של עצמי.
import { useState } from 'react';
import { state, AVATARS, PARENT_AVATARS } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';
import AvatarPicker from '../shared/AvatarPicker.jsx';

// בחירת דמות: כל אחד/ת בוחר/ת מתוך האפשרויות, אבל לא דמות שכבר תפוסה אצל בן משפחה אחר.
export function AvatarSheet() {
  const { data, token } = useApp();
  const sheet = useSheet();
  const me = data.me;
  const options = me.role === 'parent' ? PARENT_AVATARS : AVATARS;
  const taken = new Set(data.people.filter((p) => p.id !== me.id && p.avatar).map((p) => p.avatar));
  useSheetTitle(t('דמות'));

  async function pick(avatar) {
    try { await call('people:setAvatar', { token, avatar }); sheet.close(); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="form">
      <AvatarPicker value={me.avatar} onChange={pick} options={options} taken={taken} />
    </div>
  );
}

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
  useSheetTitle(step === 'start' ? t('החלפת מייל') : step === 'email' ? t('מייל לשחזור הקוד') : t('אימות המייל'));

  const go = (s) => { setErr(''); setStep(s); };

  if (step === 'start') {
    return (
      <div className="form">
        <p className="hint">{t('המייל הנוכחי: {email}. להחלפה נשלח אליו קוד אישור.', { email: current })}</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestEmailChangeCode', { token: state.token }); go('email'); }
          catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד למייל הנוכחי')}</AsyncButton>
      </div>
    );
  }
  if (step === 'email') {
    return (
      <div className="form">
        <p className="hint">{current
          ? t('שלחנו קוד אל {email}. כתבו אותו, ואת הכתובת החדשה. היא תחליף את הנוכחית רק אחרי אימות.', { email: current })
          : t('נשלח אליו קוד כשמשנים או מאפסים קוד סודי, וגם התראה כשהקוד של מישהו במשפחה ננעל.')}</p>
        {current && <Field label={t('קוד מהמייל הנוכחי')}><input {...codeProps} value={oldCode} onChange={(e) => setOldCode(e.target.value)} /></Field>}
        <Field label={current ? t('כתובת מייל חדשה') : t('כתובת מייל')}>
          <input type="email" autoComplete="email" placeholder="name@example.com" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          setErr('');
          try {
            const res = await call('emailAuth:requestVerify', { token: state.token, email, oldCode: current ? oldCode : undefined });
            if (res.ok) { setAddr(email.trim().toLowerCase()); go('code'); }
            else setErr(t('הקוד מהמייל הנוכחי שגוי או שפג תוקפו.'));
          } catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד אימות')}</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <p className="hint">{t('שלחנו קוד בן 6 ספרות אל {email}. הוא תקף ל-10 דקות.', { email: addr })}</p>
      <Field label={t('הקוד מהמייל')}><input {...codeProps} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        try {
          const res = await call('emailAuth:confirmEmail', { token: state.token, code });
          if (res.ok) { sheet.close(); toast(t('המייל אומת ✅')); }
          else setErr(t('הקוד שגוי או שפג תוקפו.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('אימות')}</AsyncButton>
      <button className="ghost" type="button" onClick={() => go(current ? 'start' : 'email')}>{t('כתובת אחרת')}</button>
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
  useSheetTitle(t('שינוי הקוד הסודי'));

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">{t('לאישור נשלח קוד אימות ל-{email}.', { email: data.me.email })}</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestChangeCode', { token: state.token }); setErr(''); setStep('form'); }
          catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד למייל')}</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <Field label={t('הקוד מהמייל')}><input {...codeProps} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(data.me.role) })}><input {...pinProps('new-password', pinMax(data.me.role))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(newPin, data.me.role)) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel(data.me.role) })); return; }
        try {
          const res = await call('emailAuth:changePinWithCode', { token: state.token, code, newPin });
          if (res.ok) { sheet.close(); toast(t('הקוד שונה ✅')); }
          else setErr(t('קוד האימות שגוי או שפג תוקפו.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('שמירה')}</AsyncButton>
    </div>
  );
}

// שינוי הקוד הסודי שלי (בלי מייל מאומת): הקוד הנוכחי והקוד החדש.
export function ChangePinSheet() {
  const sheet = useSheet();
  const { data } = useApp();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('שינוי הקוד הסודי'));
  return (
    <div className="form">
      <Field label={t('הקוד הנוכחי')}><input {...pinProps('current-password')} value={oldPin} onChange={(e) => setOldPin(e.target.value)} /></Field>
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(data.me.role) })}><input {...pinProps('new-password', pinMax(data.me.role))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(newPin, data.me.role)) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel(data.me.role) })); return; }
        try {
          const res = await call('auth:changeMyPin', { token: state.token, oldPin, newPin });
          if (res.ok) { sheet.close(); toast(t('הקוד שונה ✅')); }
          else if (res.reason === 'wrong') setErr(t('הקוד הנוכחי לא נכון.'));
          else if (res.reason === 'locked') setErr(t('יותר מדי ניסיונות. נסו שוב עוד דקה.'));
          else if (res.reason === 'useEmail') sheet.open(t('שינוי הקוד הסודי'), <ChangePinEmailSheet />);
          else setErr(t('משהו השתבש. נסו שוב.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('שמירה')}</AsyncButton>
    </div>
  );
}
