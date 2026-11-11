import Arrow from '../shared/Arrow.jsx';
import { useState } from 'react';
import { t, intlLocale } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { errMsg } from '../../lib/helpers.js';
import { codeGone, setToken } from '../../state/auth.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field, PasswordInput } from '../shared/fields.jsx';
import { BioError, bioAddDeviceFinish, bioMoveFinish, bioSupported } from '../../lib/biometric.js';
import { pinOk } from '../../lib/pin.js';
import { proveWithGoogle } from '../../lib/googleProof.js';

// "מכשיר חדש / החלפת מכשיר" במסך הכניסה של הורה. הורה יכול להיכנס רק ממכשירים שקשורים אליו.
// הוספת מכשיר נוסף (המכשירים הקיימים ממשיכים לעבוד), או החלפה (הקודמים מנותקים) בשלוש דרכים:
//   add      - הוספה: קוד שההורה הנפיק לעצמו ממכשיר קשור (למשל הדפדפן, כשהאפליקציה כבר קשורה)
//   parent   - קוד קישור שהורה אחר הנפיק (גם לקישור הורה חדש, וגם כשהטלפון נהרס)
//   old      - המכשיר הישן עוד אצלכם: אישרתם בו בטביעת אצבע והוא הציג קוד החלפה
//   recovery - המכשיר אבד ואין הורה אחר: קוד סודי + אימות בחשבון הגוגל, ואחרי 24 שעות משלימים
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
  async function complete(res, add = false) {
    const finish = add ? bioAddDeviceFinish : bioMoveFinish;
    const done = await finish(res.ticket, res.userId, res.name, res.challenge);
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
                : res.reason === 'full' ? t('כבר קשורים להורה הזה המספר המרבי של מכשירים. אפשר להסיר מכשיר ב"המכשירים שלי".')
                : res.reason === 'noGoogle' ? t('להורה הזה לא חובר חשבון גוגל, ולכן אי אפשר בדרך הזו. הורה אחר יכול להנפיק קוד קישור.')
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
        <p className="hint">{t('{name} נכנס/ת כהורה רק ממכשירים שקשורים אליו/ה. מה רוצים לעשות?', { name: person.name })}</p>
        <button className="ghost" type="button" onClick={() => { setMethod('add'); setStep('enter'); }}>{t('➕ הוספת המכשיר הזה (קוד מהמכשיר הקשור שלי)')}</button>
        <button className="ghost" type="button" onClick={() => { setMethod('parent'); setStep('enter'); }}>{t('🔑 יש לי קוד קישור מהורה אחר')}</button>
        <button className="ghost" type="button" onClick={() => { setMethod('old'); setStep('enter'); }}>{t('📱 המכשיר הישן עוד אצלי (קוד ממנו)')}</button>
        <button className="ghost" type="button" onClick={() => setStep('recoveryPin')}>{t('🆘 המכשיר הישן אבד או נהרס')}</button>
      </div>
    );
  }

  if (step === 'enter') {
    return (
      <div className="form">
        <p className="hint">{method === 'add'
          ? t('במכשיר שכבר קשור: "החשבון שלי" > "המכשירים שלי" > הוספת מכשיר. יופיע שם קוד. המכשירים הקיימים ימשיכו לעבוד.')
          : method === 'parent'
            ? t('הורה אחר פותח ב"ניהול" את "קוד קישור" ליד השם שלכם ומוסר לכם קוד.')
            : t('במכשיר הישן: "החשבון שלי" > "המכשירים שלי" > החלפת מכשיר. יופיע שם קוד. כל המכשירים הקודמים ינותקו.')}</p>
        <Field label={t('הקוד הסודי שלכם')}><PasswordInput {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        <Field label={method === 'add' ? t('קוד ההוספה') : method === 'parent' ? t('קוד הקישור') : t('קוד ההחלפה')}><input {...codeProps} value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={guard(async () => {
          if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
          const res = method === 'add'
            ? await call('deviceMove:addDeviceStart', { code, personId: person.id, pin, secretCode: secret })
            : await call('deviceMove:moveStart', { code, personId: person.id, pin, method, secretCode: secret });
          if (failed(res)) { setPin(''); return; }
          await complete(res, method === 'add');
        })}>{method === 'add' ? t('הוספת המכשיר הזה והכניסה') : t('קישור המכשיר הזה והכניסה')}</AsyncButton>
        <button className="ghost linkish" type="button" onClick={() => { setStep('choose'); setErr(''); }}><Arrow kind="back" /> {t('חזרה')}</button>
      </div>
    );
  }

  if (step === 'recoveryPin') {
    return (
      <div className="form">
        <p className="hint">{t('תאשרו עם חשבון הגוגל שחיברתם. אחרי זה ההחלפה תתאפשר רק בעוד 24 שעות, ובינתיים תישלח התראה לכם ולהורים האחרים והם יוכלו לבטל.')}</p>
        <Field label={t('הקוד הסודי שלכם')}><PasswordInput {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        {err && <Err>{err}</Err>}
        <AsyncButton className="primary" onClick={async () => {
          setErr('');
          if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
          try {
            const res = await call('deviceMove:recoveryRequest', { code, personId: person.id, pin });
            if (failed(res)) { setPin(''); return; }
            const r = await proveWithGoogle('deviceRecovery', { code, personId: person.id });
            if (!r) return;
            if (r.reason === 'code') { sheet.close(); codeGone(); return; }
            if (r.error) { setErr(r.error); return; }
            const conf = await call('deviceMove:recoveryConfirm', { code, personId: person.id, pin, proof: r.proof });
            if (failed(conf)) return;
            // הסוד נשמר רק במכשיר הזה: רק הוא יכול להשלים את ההחלפה אחרי ההמתנה.
            const ok = /** @type {any} */ (conf);
            localStorage.setItem(RECOVERY_KEY(person.id), JSON.stringify({ secret: ok.secret, readyAt: ok.readyAt }));
            setPin('');
            setStep('recoveryStatus');
          } catch (e) { setErr(errMsg(e)); }
        }}>{t('אישור עם גוגל')}</AsyncButton>
        <button className="ghost linkish" type="button" onClick={() => { setStep('choose'); setErr(''); }}><Arrow kind="back" /> {t('חזרה')}</button>
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
          <Field label={t('הקוד הסודי שלכם')}><PasswordInput {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
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
