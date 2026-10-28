import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { call, useQuery } from '../../lib/api.js';
import { errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useSheetTitle } from '../shared/Sheet.jsx';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { Err } from '../shared/fields.jsx';
import { BioError } from '../../lib/biometric.js';

// "המכשיר שלי" להורה: הורה נכנס רק מהמכשיר הזה. כאן מחליפים מכשיר (כשהמכשיר הזה עדיין אצלכם).
export function DeviceSheet() {
  const { token, data } = useApp();
  const bioConfirm = useBioConfirm();
  const dev = useQuery('biometric:deviceStatus', { token });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  useSheetTitle(t('המכשיר שלי'));

  async function requestMove() {
    setErr('');
    try {
      const proof = await bioConfirm('move-device', { title: t('אישור החלפת מכשיר'), need: t('להחליף מכשיר') });
      await call('deviceMove:requestMoveCode', { token, proof });
      setSent(true);
    } catch (e) { setErr(e instanceof BioError ? e.message : errMsg(e)); }
  }

  return (
    <div className="form">
      <p className="hint">{dev?.bound
        ? t('✅ ההורה הזה קשור למכשיר הזה. כניסה כהורה אפשרית רק ממנו, עם הקוד הסודי וטביעת אצבע או זיהוי פנים.')
        : t('המכשיר הזה עוד לא קשור להורה.')}</p>
      <p className="hint">{t('מחליפים טלפון? לוחצים כאן, מאשרים בטביעת אצבע, ונשלח קוד למייל. אחר כך פותחים את הקופה בטלפון החדש, בוחרים את השם שלכם ולוחצים "מכשיר חדש / החלפת מכשיר". הטלפון הישן ינותק.')}</p>
      <p className="hint">{t('הטלפון נהרס או אבד? הורה אחר יכול להנפיק לכם קוד קישור ב"ניהול". אם אין הורה אחר, בקשו החלפה במסך הכניסה: היא תתאפשר אחרי 24 שעות, ותקבלו על כך מייל.')}</p>
      {!data.me.email && <p className="hint">{t('כדי להחליף מכשיר מהטלפון הזה צריך מייל מאומת. הוסיפו מייל ב"החשבון שלי".')}</p>}
      {sent && <p className="hint">{t('✅ נשלח קוד למייל. הזינו אותו בטלפון החדש.')}</p>}
      {err && <Err>{err}</Err>}
      {data.me.email && <AsyncButton className="primary" onClick={requestMove}>{t('החלפת מכשיר (שליחת קוד למייל)')}</AsyncButton>}
    </div>
  );
}
