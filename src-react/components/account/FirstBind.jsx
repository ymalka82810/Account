import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { useQuery } from '../../lib/api.js';
import { errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import AsyncButton from '../shared/AsyncButton.jsx';
import { pinProps, Err, Field, PasswordInput } from '../shared/fields.jsx';
import { proveWithGoogle } from '../../lib/googleProof.js';
import { BioError, bioReady, bioRegister, bioSupported } from '../../lib/biometric.js';
import { pinOk } from '../../lib/pin.js';
import { isNativeApp } from '../../lib/updater.js';

// קישור ראשון של המכשיר להורה: קוד סודי, ואם חובר חשבון גוגל גם אימות בו, ואז טביעת אצבע / זיהוי פנים.
// אפשרי רק כשאין עדיין במשפחה הורה קשור. הורה נוסף נקשר בקוד קישור (מסך "מכשיר חדש" בכניסה).
// onDone() אחרי קישור מוצלח.
export default function FirstBindForm({ onDone }) {
  const { token, me } = useApp();
  const dev = useQuery('biometric:deviceStatus', { token });
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  if (!dev) return <p className="hint">{t('⏳ רגע…')}</p>;

  // מקושר בשרת, אבל המכשיר הזה לא מחזיק את המפתח (למשל נוקו נתוני האפליקציה): רק החלפת מכשיר פותרת את זה.
  if (dev.bound && !bioReady(me)) {
    return <p className="hint">{t('ההורה הזה כבר קשור למכשיר אחר, או שהמפתח נמחק מהמכשיר הזה. כדי להמשיך מכאן צריך להחליף מכשיר: יוצאים, ובמסך הכניסה לוחצים על "מכשיר חדש / החלפת מכשיר".')}</p>;
  }
  if (!dev.canBindSelf) {
    return <p className="hint">{t('במשפחה כבר יש הורה שקשור למכשיר, ולכן כדי לקשר את המכשיר הזה צריך קוד קישור ממנו. יוצאים, ובמסך הכניסה לוחצים על "מכשיר חדש / החלפת מכשיר".')}</p>;
  }

  async function bind() {
    if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
    if (!(await bioSupported())) { setErr(t('כדי לקשר מכשיר צריך טביעת אצבע או זיהוי פנים שמוגדרים בו.')); return; }
    setErr('');
    let proof;
    if (dev.needsGoogle) {
      const r = await proveWithGoogle('deviceFirst', { token });
      if (!r) return;
      if (r.error) { setErr(r.error); return; }
      proof = r.proof;
    }
    try {
      const res = /** @type {{ ok: boolean, reason?: string }} */ (await bioRegister(token, pin, proof));
      if (!res.ok) {
        setErr(res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
          : res.reason === 'nopin' ? t('אין לכם קוד סודי. קבעו קוד ב"החשבון שלי" ונסו שוב.')
            : res.reason === 'needGoogle' || res.reason === 'proof' ? t('האימות עם גוגל פג. נסו שוב.')
              : res.reason === 'bound' || res.reason === 'needBindCode' ? t('אי אפשר לקשר ככה. צריך החלפת מכשיר.')
                : t('הקוד הסודי שגוי.'));
        setPin('');
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof BioError ? e.message : (typeof /** @type {any} */ (e)?.data === 'string' ? errMsg(e) : t('משהו השתבש. נסו שוב.')));
    }
  }

  return (
    <div className="form">
      <p className="hint">
        {t('הורה נכנס רק ממכשירים שקשורים אליו (אפשר להוסיף עוד מכשיר אחר כך), ופעולות הורה מאושרות בטביעת אצבע או בזיהוי פנים.')}{' '}
        {isNativeApp ? t('צריך לקשר את הטלפון הזה פעם אחת.') : t('צריך לקשר את המכשיר והדפדפן הזה פעם אחת.')}
      </p>
      <Field label={t('הקוד הסודי שלכם, לאישור')}>
        <PasswordInput {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
      {dev.needsGoogle && <p className="hint">{t('לאישור ייפתח חשבון הגוגל שלכם.')}</p>}
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={bind}>{t('קישור המכשיר')}</AsyncButton>
    </div>
  );
}
