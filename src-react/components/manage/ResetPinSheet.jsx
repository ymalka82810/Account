import { useState } from 'react';
import { t } from '../../i18n/index.js';
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
  useSheetTitle(step === 'send' ? t('אישור במייל') : t('קוד סודי ל{name}', { name: p.name }));

  if (step === 'send') {
    return (
      <div className="form">
        <p className="hint">{t('כדי לקבוע קוד חדש ל{name} נשלח קוד אימות ל-{email}.', { name: p.name, email: data.me.email })}</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          try { await call('emailAuth:requestChildResetCode', { token: state.token }); setErr(''); setStep('form'); }
          catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד למייל')}</AsyncButton>
      </div>
    );
  }

  const run = async (newPin) => {
    if (!emailRequired && !pinOk(myPin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
    try {
      const res = await call('auth:resetPin', {
        token: state.token, personId: p.id, pin: newPin,
        emailCode: emailRequired ? emailCode : undefined,
        myPin: emailRequired ? undefined : myPin,
      });
      if (res && res.ok === false) {
        setErr(res.reason === 'wrongMyPin' ? t('הקוד הסודי שהקלדתם שגוי.')
          : res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
            : t('קוד האימות מהמייל שגוי או שפג תוקפו.'));
        return;
      }
      sheet.close();
      toast(newPin ? t('הקוד של {name} עודכן', { name: p.name }) : g(p.gender, '{name} יבחר קוד חדש בכניסה הבאה', '{name} תבחר קוד חדש בכניסה הבאה', '{name} יבחר/תבחר קוד חדש בכניסה הבאה', { name: p.name }));
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="form">
      {emailRequired && <Field label={t('קוד אימות מהמייל')}><input {...codeProps} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} /></Field>}
      {!emailRequired && <Field label={t('הקוד הסודי שלכם, לאישור')}><input {...pinProps('current-password')} value={myPin} onChange={(e) => setMyPin(e.target.value)} /></Field>}
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(p.role) })}><input {...pinProps('new-password', pinMax(p.role))} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(pin, p.role)) { setErr(t('הקוד צריך להיות {rule}.', { rule: pinLabel(p.role) })); return; }
        await run(pin);
      }}>{t('קביעת הקוד')}</AsyncButton>
      <AsyncButton className="ghost" onClick={() => run(undefined)}>{t('לאפס, ושיבחרו לבד בכניסה הבאה')}</AsyncButton>
    </div>
  );
}
