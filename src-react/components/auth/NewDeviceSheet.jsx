import { useState } from 'react';
import { t, intlLocale } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { errMsg } from '../../lib/helpers.js';
import { codeGone, setToken } from '../../state/auth.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';
import { BioError, bioMoveFinish, bioSupported } from '../../lib/biometric.js';
import { pinOk } from '../../lib/pin.js';

// "מכשיר חדש / החלפת מכשיר" במסך הכניסה של הורה. הורה קשור למכשיר אחד, והחלפה אפשרית בשלוש דרכים:
//   parent   - קוד קישור שהורה אחר הנפיק (גם לקישור הורה חדש, וגם כשהטלפון נהרס)
//   email    - המכשיר הישן עוד אצלכם: אישרתם בו בטביעת אצבע וקיבלתם קוד למייל
//   recovery - המכשיר אבד ואין הורה אחר: קוד סודי + קוד מהמייל, ואחרי 24 שעות משלימים
const RECOVERY_KEY = (personId) => 'kupa-recovery:' + personId;
const readRecovery = (personId) => { try { return JSON.parse(localStorage.getItem(RECOVERY_KEY(personId)) || 'null'); } catch (e) { return null; } };

export function NewDeviceSheet() {
  const sheet = useSheet();
  const f = state.pinFlow;
  const person = f && f.person;
  const [step, setStep] = useState(() => (person && readRecovery(person.id) ? 'recoveryStatus' : 'choose'));
  const [method, setMethod] = useState('parent');
  const [pin, setPin] = useState('');
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('מכשיר חדש / החלפת מכשיר'));
  if (!f || f.legacy || !person) return null;
  const code = state.fam.code;

  // הכניסה למכשיר החדש: יוצרים מפתח ומשלימים. אחרי זה נכנסים ישר.
  async function complete(res) {
    const done = await bioMoveFinish(res.ticket, res.userId, res.name, res.challenge);
    if (!done.ok) { setErr(t('משהו השתבש. נסו שוב.')); return; }
    localStorage.removeItem(RECOVERY_KEY(person.id));
    state.pinFlow = null;
    sheet.close();
    setToken(done.token);
  }

  // תשובת שרת שהיא לא הצלחה -> הודעה. מחזיר true אם טופל.
  function failed(res) {
    if (res.ok) return false;
    if (res.reason === 'code') { sheet.close(); codeGone(); return true; }
    setErr(
      res.reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד דקה.')
        : res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
          : res.reason === 'wrong' ? t('הקוד הסודי שגוי.')
            : res.reason === 'nopin' ? t('אין להורה הזה קוד סודי עדיין.')
              : res.reason === 'secretCode' ? t('הקוד שגוי או שפג תוקפו.')
                : res.reason === 'noEmail' ? t('אין להורה הזה מייל מאומת, ולכן אי אפשר בדרך הזו. הורה אחר יכול להנפיק קוד קישור.')
                  : res.reason === 'wait' ? t('עוד לא עברו 24 שעות מהבקשה.')
                    : res.reason === 'none' ? t('אין בקשה פעילה, או שהיא בוטלה. אפשר להגיש בקשה חדשה.')
                      : t('משהו השתבש. נסו שוב.'),
    );
    return true;
  }

  // עוטף פעולה שמסתיימת ביצירת מפתח: שגיאות ביומטריה והשרת הופכות להודעה.
  const guard = (fn) => async () => {
    setErr('');
    if (!(await bioSupported())) { setErr(t('כדי לקשר מכשיר צריך טביעת אצבע או זיהוי פנים שמוגדרים בו.')); return; }
    try { await fn(); }
    catch (e) { setErr(e instanceof BioError ? e.message : errMsg(e)); }
  };

  if (step === 'choose') {
    return (
      <div className="form">
        <p className="hint">{t('{name} נכנס/ת כהורה רק מהמכשיר שלו/ה. איך מחליפים?', { name: person.name })}</p>
        <button className="ghost" type="button" onClick={() => { setMethod('parent'); setStep('enter'); }}>{t('🔑 יש לי קוד קישור מהורה אחר')}</button>
        <button className="ghost" type="button" onClick={() => { setMethod('email'); setStep('enter'); }}>{t('📧 המכשיר הישן עוד אצלי (קוד במייל)')}</button>
        <button className="ghost" type="button" onClick={() => setStep('recoveryPin')}>{t('🆘 המכשיר הישן אבד או נהרס')}</button>
      </div>
    );
  }

  if (step === 'enter') {
    return (
      <div className="form">
        <p className="hint">{method === 'parent'
          ? t('הורה אחר פותח ב"ניהול" את "קוד קישור" ליד השם שלכם ומוסר לכם קוד.')
          : t('במכשיר הישן: "החשבון שלי" > "המכשיר שלי" > החלפת מכשיר. הקוד יגיע למייל.')}</p>
        <Field label={t('הקוד הסודי שלכם')}><input {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        <Field label={method === 'parent' ? t('קוד הקישור') : t('הקוד מהמייל')}><input {...codeProps} value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={guard(async () => {
          if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
          const res = await call('deviceMove:moveStart', { code, personId: person.id, pin, method, secretCode: secret });
          if (failed(res)) { setPin(''); return; }
          await complete(res);
        })}>{t('קישור המכשיר הזה והכניסה')}</AsyncButton>
        <button className="ghost linkish" type="button" onClick={() => { setStep('choose'); setErr(''); }}>{t('→ חזרה')}</button>
      </div>
    );
  }

  if (step === 'recoveryPin') {
    return (
      <div className="form">
        <p className="hint">{t('נשלח קוד למייל המאומת שלכם. אחרי שתאשרו אותו ההחלפה תתאפשר רק בעוד 24 שעות, ובינתיים תישלח התראה לכם ולהורים האחרים והם יוכלו לבטל.')}</p>
        <Field label={t('הקוד הסודי שלכם')}><input {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          setErr('');
          if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
          try {
            const res = await call('deviceMove:recoveryRequest', { code, personId: person.id, pin });
            if (failed(res)) { setPin(''); return; }
            setStep('recoveryCode');
          } catch (e) { setErr(errMsg(e)); }
        }}>{t('שליחת קוד למייל')}</AsyncButton>
        <button className="ghost linkish" type="button" onClick={() => { setStep('choose'); setErr(''); }}>{t('→ חזרה')}</button>
      </div>
    );
  }

  if (step === 'recoveryCode') {
    return (
      <div className="form">
        <Field label={t('הקוד מהמייל')}><input {...codeProps} value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          setErr('');
          try {
            const res = await call('deviceMove:recoveryConfirm', { code, personId: person.id, pin, emailCode: secret });
            if (failed(res)) return;
            // הסוד נשמר רק במכשיר הזה: רק הוא יכול להשלים את ההחלפה אחרי ההמתנה.
            const ok = /** @type {any} */ (res);
            localStorage.setItem(RECOVERY_KEY(person.id), JSON.stringify({ secret: ok.secret, readyAt: ok.readyAt }));
            setPin(''); setSecret('');
            setStep('recoveryStatus');
          } catch (e) { setErr(errMsg(e)); }
        }}>{t('אישור הבקשה')}</AsyncButton>
      </div>
    );
  }

  // recoveryStatus: הבקשה הוגשה ממכשיר זה; מחכים, ואז משלימים.
  const saved = readRecovery(person.id);
  if (!saved) { setStep('choose'); return null; }
  const ready = Date.now() >= saved.readyAt;
  return (
    <div className="form">
      {ready ? (
        <>
          <p className="hint">{t('אפשר להשלים את ההחלפה. הקלידו את הקוד הסודי וקשרו את המכשיר הזה.')}</p>
          <Field label={t('הקוד הסודי שלכם')}><input {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
          {err && <Err>{err}</Err>}
          <AsyncButton className="primary" onClick={guard(async () => {
            if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
            const res = await call('deviceMove:recoveryFinish', { code, personId: person.id, pin, secret: saved.secret });
            if (failed(res)) { if (/** @type {any} */ (res).reason === 'none') localStorage.removeItem(RECOVERY_KEY(person.id)); setPin(''); return; }
            await complete(res);
          })}>{t('השלמת ההחלפה והכניסה')}</AsyncButton>
        </>
      ) : (
        <p className="hint">{t('הבקשה התקבלה. ההחלפה תתאפשר ב-{when}. עד אז הטלפון הישן, אם יימצא, עדיין עובד, וההורים יכולים לבטל את הבקשה.', {
          when: new Date(saved.readyAt).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }),
        })}</p>
      )}
      <button className="ghost linkish" type="button" onClick={() => { localStorage.removeItem(RECOVERY_KEY(person.id)); setStep('choose'); }}>{t('ביטול הבקשה במכשיר הזה')}</button>
    </div>
  );
}
