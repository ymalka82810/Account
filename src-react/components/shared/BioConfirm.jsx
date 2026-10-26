import { t } from '../../i18n/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from './Sheet.jsx';
import AsyncButton from './AsyncButton.jsx';
import { pinProps, Err, Field } from './fields.jsx';
import { BioError, bioProve, bioReady, bioRegister, bioSupported } from '../../lib/biometric.js';
import { pinOk } from '../../lib/pin.js';
import { translateServer } from '../../i18n/serverMessages.js';
import { isNativeApp } from '../../lib/updater.js';

// רישום המכשיר לאימות ביומטרי: ההורה מאשר עם הקוד הסודי שלו, ואז טביעת אצבע / זיהוי פנים.
// onDone(true) אחרי רישום, onDone(false) אם החלון נסגר בלי רישום.
function BioSetupSheet({ onDone, reason }) {
  const { token } = useApp();
  const sheet = useSheet();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const done = useRef(false);
  useSheetTitle(t('הפעלת אימות ביומטרי'));
  useEffect(() => () => { if (!done.current) onDone(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function register() {
    if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
    setErr('');
    try {
      const res = /** @type {{ ok: boolean, reason?: string }} */ (await bioRegister(token, pin));
      if (!res.ok) {
        setErr(res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
          : res.reason === 'nopin' ? t('אין לכם קוד סודי. קבעו קוד ב"החשבון שלי" ונסו שוב.')
            : t('הקוד הסודי שגוי.'));
        setPin('');
        return;
      }
      done.current = true;
      sheet.close();
      onDone(true);
    } catch (e) {
      setErr(e instanceof BioError ? e.message : (typeof e?.data === 'string' ? translateServer(e.data) : t('משהו השתבש. נסו שוב.')));
    }
  }

  return (
    <div className="form">
      <p className="hint">
        {reason || t('שינוי תפקיד במשפחה (ילד/ה, נער/ה, הורה) מאושר בטביעת אצבע או בזיהוי פנים.')}
        {' '}{isNativeApp ? t('צריך לרשום את הטלפון הזה פעם אחת.') : t('צריך לרשום את המכשיר והדפדפן הזה פעם אחת.')}
      </p>
      <Field label={t('הקוד הסודי שלכם, לאישור')}>
        <input {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={register}>{t('רישום טביעת אצבע / זיהוי פנים')}</AsyncButton>
    </div>
  );
}

// מחזיר confirm(action, opts) שמחזיר proof לשרת, או זורק BioError (code: unsupported/cancel/failed).
// opts (לא חובה): { reason } - הסבר בחלון הרישום, { need } - מה צריך מכשיר ביומטרי בשבילו,
// { title } - הכותרת בחלון האימות של האפליקציה.
// אם המכשיר עוד לא רשום, פותח קודם את חלון הרישום.
export function useBioConfirm() {
  const sheet = useSheet();
  const { token, me } = useApp();

  const setup = useCallback((reason) => new Promise((resolve) => {
    sheet.open(t('הפעלת אימות ביומטרי'), <BioSetupSheet onDone={resolve} reason={reason} />);
  }), [sheet]);

  return useCallback(async (action, opts = {}) => {
    if (!(await bioSupported())) {
      throw new BioError('unsupported', t('כדי {need} צריך מכשיר עם טביעת אצבע או זיהוי פנים שמוגדרים בו.', { need: opts.need || t('לשנות תפקיד') }));
    }
    if (!bioReady(me) && !(await setup(opts.reason))) throw new BioError('cancel', t('האימות בוטל'));
    try {
      return await bioProve(token, me, action, opts.title);
    } catch (e) {
      if (!(e instanceof BioError) || e.code !== 'needSetup') throw e;
      if (!(await setup(e.message + '.'))) throw new BioError('cancel', t('האימות בוטל'));
      return await bioProve(token, me, action, opts.title);
    }
  }, [token, me, setup]);
}
