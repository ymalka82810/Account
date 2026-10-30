import { t } from '../../i18n/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from './Sheet.jsx';
import FirstBindForm from '../account/FirstBind.jsx';
import AsyncButton from './AsyncButton.jsx';
import { Err, Field, pinProps } from './fields.jsx';
import { call } from '../../lib/api.js';
import { errMsg } from '../../lib/helpers.js';
import { pinOk } from '../../lib/pin.js';
import { BioError, bioProve, bioReady, bioSupported } from '../../lib/biometric.js';

// קישור המכשיר להורה (בדרך כלל כבר נעשה בהקמה, ולכן זה נפתח רק אם משהו חסר במכשיר הזה).
// onDone(true) אחרי קישור, onDone(false) אם החלון נסגר בלי קישור.
function BioSetupSheet({ onDone, reason }) {
  const sheet = useSheet();
  const done = useRef(false);
  useSheetTitle(t('קישור המכשיר'));
  useEffect(() => () => { if (!done.current) onDone(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {reason && <p className="hint">{reason}</p>}
      <FirstBindForm onDone={() => { done.current = true; sheet.close(); onDone(true); }} />
    </>
  );
}

// הסבר קצר לפני חלון המערכת של האימות: למה מבקשים אותו. onDone(true) בהמשך, onDone(false) בביטול / סגירה.
function BioWhySheet({ onDone, why }) {
  const sheet = useSheet();
  const done = useRef(false);
  useSheetTitle(t('אישור הורה'));
  useEffect(() => () => { if (!done.current) onDone(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = (ok) => { done.current = true; sheet.close(); onDone(ok); };
  return (
    <div className="form">
      <p className="hint">{why}</p>
      <button className="primary" type="button" onClick={() => finish(true)}>{t('המשך לאימות')}</button>
      <button className="ghost" type="button" onClick={() => finish(false)}>{t('ביטול')}</button>
    </div>
  );
}

// מסלול חלופי למכשיר בלי טביעת אצבע / זיהוי פנים: הקוד הסודי של ההורה.
// onDone(proof) אחרי אישור, onDone(null) בביטול / סגירה.
function PinFallbackSheet({ onDone, action, why }) {
  const sheet = useSheet();
  const { token } = useApp();
  const done = useRef(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('אישור בקוד סודי'));
  useEffect(() => () => { if (!done.current) onDone(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    if (!pinOk(pin, 'parent')) { setErr(t('הקלידו את הקוד הסודי שלכם.')); return; }
    try {
      const res = await call('biometric:pinConfirm', { token, action, myPin: pin });
      if (!res.ok) {
        setErr(res.reason === 'locked' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
          : res.reason === 'nopin' ? t('אין לכם קוד סודי. קבעו קוד ב"החשבון שלי" ונסו שוב.')
            : t('הקוד הסודי שגוי.'));
        setPin('');
        return;
      }
      done.current = true; sheet.close(); onDone({ pinChallenge: res.challenge });
    } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <div className="form">
      <p className="hint">{why}</p>
      <p className="hint">{t('במכשיר הזה אין טביעת אצבע או זיהוי פנים, אז מאשרים עם הקוד הסודי שלכם.')}</p>
      <Field label={t('הקוד הסודי שלכם, לאישור')}>
        <input {...pinProps('current-password')} value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={confirm}>{t('אישור')}</AsyncButton>
    </div>
  );
}

// פעולות שמותר לאשר בקוד סודי כשאין ביומטריה (חייב להתאים ל-PIN_FALLBACK_ACTIONS ב-convex/biometric.ts).
const pinFallbackOk = (action) => /^(add|role):/.test(action);

// מחזיר confirm(action, opts) שמחזיר proof לשרת, או זורק BioError (code: unsupported/cancel/failed).
// opts (לא חובה): { reason } - הסבר בחלון הרישום, { need } - מה צריך מכשיר ביומטרי בשבילו,
// { title } - הכותרת בחלון האימות של האפליקציה, { why } - הסבר שמוצג לפני האימות.
// אם המכשיר עוד לא רשום, פותח קודם את חלון הרישום. אם אין במכשיר ביומטריה ואפשר לאשר את הפעולה
// בקוד סודי, מציע את זה במקום לחסום.
export function useBioConfirm() {
  const sheet = useSheet();
  const { token, me } = useApp();

  const setup = useCallback((reason) => new Promise((resolve) => {
    sheet.open(t('הפעלת אימות ביומטרי'), <BioSetupSheet onDone={resolve} reason={reason} />);
  }), [sheet]);

  return useCallback(async (action, opts = {}) => {
    if (opts.why && !(await new Promise((resolve) => {
      sheet.open(t('אישור הורה'), <BioWhySheet onDone={resolve} why={opts.why} />);
    }))) throw new BioError('cancel', t('האימות בוטל'));
    if (!(await bioSupported())) {
      if (pinFallbackOk(action)) {
        const proof = await new Promise((resolve) => {
          sheet.open(t('אישור בקוד סודי'), <PinFallbackSheet onDone={resolve} action={action} why={opts.why} />);
        });
        if (!proof) throw new BioError('cancel', t('האימות בוטל'));
        return proof;
      }
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
