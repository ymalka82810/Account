import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { enablePush, isPushOn, pushSupported } from '../../lib/push.js';
import AsyncButton from '../shared/AsyncButton.jsx';

// הורה שעוד לא הפעיל התראות במכשיר הזה לא יקבל הודעה כשמישהו מבקש להצטרף או רושם חוב.
// ההפעלה חבויה ב"החשבון שלי", אז מציעים אותה כאן בלחיצה אחת. נעלם ברגע שההתראות פעילות.
export default function PushPrompt() {
  const [on, setOn] = useState(/** @type {boolean | null} */ (null));
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');
  useEffect(() => { if (pushSupported()) isPushOn().then(setOn); }, []);
  if (!pushSupported() || on !== false) return null;
  return (
    <div className="card notice">
      <p><strong>{t('🔔 רוצים לדעת מיד?')}</strong> {t('הפעלת התראות תשלח לטלפון הודעה כשמישהו מבקש להצטרף למשפחה או רושם חוב שממתין לאישור שלך.')}</p>
      <AsyncButton className="primary" onClick={async () => { setErr(''); setErr(await enablePush(setProgress)); setOn(await isPushOn()); }}>{t('הפעלת התראות')}</AsyncButton>
      {progress && <p className="push-progress" role="status">{progress}</p>}
      {err && <p className="push-err" role="alert">{err}</p>}
    </div>
  );
}
