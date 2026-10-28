import { t } from '../../i18n/index.js';
import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from './Sheet.jsx';
import FirstBindForm from '../account/FirstBind.jsx';
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
