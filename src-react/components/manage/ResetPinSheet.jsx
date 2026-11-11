import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { pinProps, Err, Field, PasswordInput } from '../shared/fields.jsx';
import { proveWithGoogle } from '../../lib/googleProof.js';
import { g } from '../../lib/gender.js';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';

// הורה קובע קוד סודי חדש לילד/ה (אפשר גם לאפס שיבחרו לבד).
export function ResetPinSheet({ person: p }) {
  const { data } = useApp();
  const sheet = useSheet();
  // הורה שחיבר חשבון גוגל מאשר בגוגל; בלי גוגל - בקוד הסודי שלו.
  const viaGoogle = !!data.me.googleLinked;
  const [myPin, setMyPin] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('קוד סודי ל{name}', { name: p.name }));

  const run = async (newPin) => {
    setErr('');
    if (!viaGoogle && !pinOk(myPin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
    let proof;
    if (viaGoogle) {
      const r = await proveWithGoogle('childReset', { token: state.token });
      if (!r) return;
      if (r.error) { setErr(r.error); return; }
      proof = r.proof;
    }
    try {
      const res = await call('auth:resetPin', { token: state.token, personId: p.id, pin: newPin, proof, myPin: viaGoogle ? undefined : myPin });
      if (res && res.ok === false) {
        setErr(res.reason === 'wrongMyPin' ? t('הקוד הסודי שהקלדתם שגוי.')
          : res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
            : t('משהו השתבש. נסו שוב.'));
        return;
      }
      sheet.close();
      toast(newPin ? t('הקוד של {name} עודכן', { name: p.name }) : g(p.gender, '{name} יבחר קוד חדש בכניסה הבאה', '{name} תבחר קוד חדש בכניסה הבאה', '{name} יבחר/תבחר קוד חדש בכניסה הבאה', { name: p.name }));
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <div className="form">
      {!viaGoogle && <Field label={t('הקוד הסודי שלכם, לאישור')}><PasswordInput {...pinProps('current-password')} value={myPin} onChange={(e) => setMyPin(e.target.value)} /></Field>}
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(p.role) })}><PasswordInput {...pinProps('new-password', pinMax(p.role))} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {viaGoogle && <p className="hint">{t('לאישור ייפתח חשבון הגוגל שלכם.')}</p>}
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(pin, p.role)) { setErr(t('הקוד צריך להיות {rule}.', { rule: pinLabel(p.role) })); return; }
        await run(pin);
      }}>{t('קביעת הקוד')}</AsyncButton>
      <AsyncButton className="ghost" onClick={() => run(undefined)}>{t('לאפס, ושיבחרו לבד בכניסה הבאה')}</AsyncButton>
    </div>
  );
}
