// החלונות של החשבון האישי: חשבון גוגל ושינוי הקוד הסודי של עצמי.
import { useState } from 'react';
import { state, AVATARS, PARENT_AVATARS } from '../../state/state.js';
import { call, callAction } from '../../lib/api.js';
import { googleIdToken } from '../../lib/google.js';
import { googleErrMsg, proveWithGoogle } from '../../lib/googleProof.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { pinProps, Err, Field, PasswordInput } from '../shared/fields.jsx';
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

// חשבון גוגל (לכל תפקיד): חיבור, או החלפה לחשבון אחר. אחרי החיבור מאשרים בו פעולות רגישות במקום קוד במייל.
// חיבור ראשון דורש גם את הקוד הסודי (אם יש), החלפה דורשת קודם אימות בחשבון הנוכחי.
export function GoogleSheet() {
  const { data } = useApp();
  const sheet = useSheet();
  const me = data.me;
  const [myPin, setMyPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('חשבון גוגל'));

  async function link(changeProof) {
    let idToken;
    try { idToken = await googleIdToken(); } catch (e) { setErr(googleErrMsg(e)); return; }
    if (!idToken) return;
    try {
      const res = await callAction('googleAuth:link', { token: state.token, idToken, myPin: myPin || undefined, changeProof });
      if (res.ok) { sheet.close(); toast(t('חשבון הגוגל חובר ✅')); }
      else if (res.reason === 'myPin') setErr(myPin ? t('הקוד הסודי שגוי.') : t('כתבו את הקוד הסודי שלכם, לאישור.'));
      else if (res.reason === 'locked') setErr(t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.'));
      else if (res.reason === 'otherAccount') setErr(t('זה לא חשבון הגוגל שמחובר אליכם. בחרו את החשבון הנכון.'));
      else setErr(t('חשבון הגוגל הזה כבר מחובר למישהו אחר.'));
    } catch (e) { setErr(googleErrMsg(e)); }
  }

  if (me.googleLinked) {
    return (
      <div className="form">
        <p className="hint">{t('מחובר: {email}. בו מאשרים שינוי או איפוס של הקוד הסודי ופעולות רגישות אחרות.', { email: me.email })}</p>
        {err && <Err>{err}</Err>}
        <AsyncButton className="ghost" onClick={async () => {
          setErr('');
          // קודם אימות בחשבון הנוכחי, ואז בחירת החשבון החדש.
          const r = await proveWithGoogle('emailChange', { token: state.token });
          if (!r) return;
          if (r.error) { setErr(r.error); return; }
          toast(t('עכשיו בחרו את החשבון החדש'));
          await link(r.proof);
        }}>{t('החלפה לחשבון גוגל אחר')}</AsyncButton>
      </div>
    );
  }
  return (
    <div className="form">
      <p className="hint">{t('לא חובה. עם חשבון גוגל אפשר לאפס את הקוד הסודי אם שוכחים אותו, ומאשרים בו פעולות רגישות.')}</p>
      {me.hasPin && <Field label={t('הקוד הסודי שלכם, לאישור')}><PasswordInput {...pinProps('current-password', pinMax(me.role))} value={myPin} onChange={(e) => setMyPin(e.target.value)} /></Field>}
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => { setErr(''); await link(undefined); }}>{t('חיבור עם גוגל')}</AsyncButton>
    </div>
  );
}

// שינוי הקוד הסודי של מי שחיבר חשבון גוגל: אימות בגוגל במקום הקוד הנוכחי.
export function ChangePinGoogleSheet() {
  const { data } = useApp();
  const sheet = useSheet();
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('שינוי הקוד הסודי'));
  return (
    <div className="form">
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(data.me.role) })}><PasswordInput {...pinProps('new-password', pinMax(data.me.role))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        setErr('');
        if (!pinOk(newPin, data.me.role)) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel(data.me.role) })); return; }
        const r = await proveWithGoogle('pinChange', { token: state.token });
        if (!r) return;
        if (r.error) { setErr(r.error); return; }
        try {
          const res = await call('googleLink:changePinWithProof', { token: state.token, proof: r.proof, newPin });
          if (res.ok) { sheet.close(); toast(t('הקוד שונה ✅')); }
          else setErr(t('משהו השתבש. נסו שוב.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('אישור עם גוגל ושמירה')}</AsyncButton>
    </div>
  );
}

// שינוי הקוד הסודי שלי (בלי חשבון גוגל): הקוד הנוכחי והקוד החדש.
export function ChangePinSheet() {
  const sheet = useSheet();
  const { data } = useApp();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  const first = !data.me.hasPin; // נכנס/ת בלי קוד: קובעים קוד בפעם הראשונה, בלי קוד נוכחי
  useSheetTitle(first ? t('קביעת קוד סודי') : t('שינוי הקוד הסודי'));
  return (
    <div className="form">
      {!first && <Field label={t('הקוד הנוכחי')}><PasswordInput {...pinProps('current-password')} value={oldPin} onChange={(e) => setOldPin(e.target.value)} /></Field>}
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(data.me.role) })}><PasswordInput {...pinProps('new-password', pinMax(data.me.role))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        if (!pinOk(newPin, data.me.role)) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel(data.me.role) })); return; }
        try {
          const res = first ? await call('auth:setFirstPin', { token: state.token, newPin }) : await call('auth:changeMyPin', { token: state.token, oldPin, newPin });
          if (res.ok) { sheet.close(); toast(t('הקוד שונה ✅')); }
          else if (res.reason === 'wrong') setErr(t('הקוד הנוכחי לא נכון.'));
          else if (res.reason === 'locked') setErr(t('יותר מדי ניסיונות. נסו שוב עוד דקה.'));
          else if (res.reason === 'useGoogle') { sheet.back(); sheet.open(t('שינוי הקוד הסודי'), <ChangePinGoogleSheet />); }
          else setErr(t('משהו השתבש. נסו שוב.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('שמירה')}</AsyncButton>
    </div>
  );
}
