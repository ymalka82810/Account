import { useState } from 'react';
import { t, intlLocale } from '../../i18n/index.js';
import { call, useQuery } from '../../lib/api.js';
import { errMsg, toast } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useSheetTitle } from '../shared/Sheet.jsx';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import Reveal from '../shared/Reveal.jsx';
import { Err } from '../shared/fields.jsx';
import { BioError, bioLocalCredential } from '../../lib/biometric.js';

const deviceName = (d) => d.label || (d.kind === 'android' ? t('אפליקציה') : t('דפדפן'));
const dateOf = (ms) => new Date(ms).toLocaleDateString(intlLocale(), { dateStyle: 'short' });

// "המכשירים שלי" להורה: הורה נכנס רק מהמכשירים שקשורים אליו (עד כמה שהשרת מתיר, למשל האפליקציה והדפדפן).
// כאן מוסיפים מכשיר נוסף, מסירים מכשיר, ומחליפים מכשיר (כשמעבר לטלפון חדש).
export function DeviceSheet() {
  const { token, me, data } = useApp();
  const bioConfirm = useBioConfirm();
  const confirm = useConfirm();
  const dev = useQuery('biometric:deviceStatus', { token });
  const [sent, setSent] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('המכשירים שלי'));
  const devices = dev?.devices || [];
  const here = bioLocalCredential(me);
  const full = !!dev && devices.length >= dev.max;

  async function requestMove() {
    setErr('');
    try {
      const proof = await bioConfirm('move-device', { title: t('אישור החלפת מכשיר'), need: t('להחליף מכשיר') });
      await call('deviceMove:requestMoveCode', { token, proof });
      setSent(true);
    } catch (e) { setErr(e instanceof BioError ? e.message : errMsg(e)); }
  }

  // קוד להוספת מכשיר נוסף: מאשרים בטביעת אצבע כאן, ומקלידים את הקוד במכשיר החדש.
  async function addDevice() {
    setErr('');
    try {
      const proof = await bioConfirm('add-device', { title: t('אישור הוספת מכשיר'), need: t('להוסיף מכשיר') });
      const res = await call('deviceMove:issueAddCode', { token, proof });
      setAddCode(res.code);
    } catch (e) { setErr(e instanceof BioError ? e.message : errMsg(e)); }
  }

  async function removeDevice(d) {
    setErr('');
    if (!(await confirm({
      icon: '⚠️',
      title: t('הסרת מכשיר'),
      amount: deviceName(d),
      message: t('המכשיר הזה יפסיק להיכנס כהורה. אפשר להוסיף אותו שוב אחר כך.'),
      okText: t('כן, להסיר'),
      danger: true,
    }))) return;
    try {
      const proof = await bioConfirm('remove-device:' + d.id, { title: t('אישור הסרת מכשיר'), need: t('להסיר מכשיר') });
      await call('deviceMove:removeDevice', { token, keyId: d.id, proof });
      toast(t('המכשיר הוסר ✅'));
    } catch (e) { setErr(e instanceof BioError ? e.message : errMsg(e)); }
  }

  return (
    <div className="form">
      {/* הרשימה נטענת מהשרת אחרי שהחלון כבר נפתח (אם לא נטענה מראש): מחליקה פנימה בהדרגה במקום לקפוץ (וגם בלי הודעת "לא קשור" שמופיעה לרגע ונעלמת) */}
      <Reveal show={!!dev}>
        <div className="form">
          <p className="hint">{dev?.bound
            ? t('✅ כניסה כהורה אפשרית רק מהמכשירים שברשימה, עם הקוד הסודי וטביעת אצבע או זיהוי פנים.')
            : t('המכשיר הזה עוד לא קשור להורה.')}</p>
          {devices.map((d) => (
            <div className="person" key={d.id}>
              <div className="text">
                {deviceName(d)}{d.credentialId === here ? ' ' + t('(המכשיר הזה)') : ''}
                <div className="meta">
                  {t('נוסף ב-{date}', { date: dateOf(d.createdAt) })}
                  {d.lastUsedAt ? ' • ' + t('שימוש אחרון: {date}', { date: dateOf(d.lastUsedAt) }) : ''}
                </div>
              </div>
              {devices.length > 1 && d.credentialId !== here && (
                <AsyncButton className="small danger" onClick={() => removeDevice(d)}>{t('הסרה')}</AsyncButton>
              )}
            </div>
          ))}
          {dev?.bound && devices.length > 1 && <p className="hint">{t('את המכשיר שבו אתם נמצאים מסירים ממכשיר אחר.')}</p>}
        </div>
      </Reveal>
      <Reveal show={!!addCode} appear>
        <div className="form">
          <div className="big-emoji code-display" aria-label={t('קוד ההוספה')}>{addCode}</div>
          <p className="hint">{t('במכשיר החדש: פותחים את הקופה, בוחרים את השם שלכם, לוחצים על "מכשיר חדש / החלפת מכשיר" ואז על "הוספת המכשיר הזה", ומקלידים את הקוד הסודי שלכם ואת הקוד הזה. הקוד תקף 30 דקות ופעם אחת.')}</p>
        </div>
      </Reveal>
      <Reveal show={!addCode && !!dev?.bound}>
        {full
          ? <p className="hint">{t('קשורים כבר {n} מכשירים, וזה המקסימום. כדי להוסיף עוד, מסירים מכשיר.', { n: devices.length })}</p>
          : <AsyncButton className="primary" onClick={addDevice}>{t('➕ הוספת מכשיר (למשל דפדפן)')}</AsyncButton>}
      </Reveal>
      <p className="hint">{t('מחליפים טלפון? לוחצים כאן, מאשרים בטביעת אצבע, ונשלח קוד למייל. אחר כך פותחים את הקופה בטלפון החדש, בוחרים את השם שלכם ולוחצים "מכשיר חדש / החלפת מכשיר". כל המכשירים הקודמים ינותקו.')}</p>
      <p className="hint">{t('הטלפון נהרס או אבד? הורה אחר יכול להנפיק לכם קוד קישור ב"ניהול". אם אין הורה אחר, בקשו החלפה במסך הכניסה: היא תתאפשר אחרי 24 שעות, ותקבלו על כך מייל.')}</p>
      {!data.me.email && <p className="hint">{t('כדי להחליף מכשיר מהטלפון הזה צריך מייל מאומת. הוסיפו מייל ב"החשבון שלי".')}</p>}
      <Reveal show={!!sent} appear><p className="hint">{t('✅ נשלח קוד למייל. הזינו אותו בטלפון החדש.')}</p></Reveal>
      {err && <Err>{err}</Err>}
      {data.me.email && <AsyncButton className="ghost" onClick={requestMove}>{t('החלפת מכשיר (שליחת קוד למייל)')}</AsyncButton>}
    </div>
  );
}
