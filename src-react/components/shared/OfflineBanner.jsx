import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { client } from '../../lib/client.js';
import { deviceHasFamily } from '../../state/auth.js';
import { startOutbox } from '../../lib/outbox.js';

// סימון קצר כשאין חיבור לשרת. הפנקס האישי נשמר במכשיר, ולכן לא נחסם ולא תלוי בחיבור.
// מה שהקוד באמת עושה: רישום חוב או החזר חדש בלי חיבור נשמר במכשיר (lib/outbox.js) ונשלח כשהחיבור חוזר, גם אחרי סגירת האפליקציה.
// שאר השינויים: לקוח Convex שולח מחדש בקשות שהמתינו, אבל רק בזמן שהאפליקציה פתוחה. פעולות שרת מסוג action נכשלות ומציגות שגיאה.
// מופיע רק במכשיר שיש בו קופה משפחתית, ורק אחרי כמה שניות בלי חיבור, כדי שלא יהבהב בפתיחת האפליקציה.
const DELAY_MS = 4000;

export default function OfflineBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!client) return undefined;
    const stopOutbox = startOutbox();
    let timer = 0;
    const apply = (/** @type {{ isWebSocketConnected: boolean }} */ cs) => {
      clearTimeout(timer);
      if (cs.isWebSocketConnected) { setDown(false); return; }
      timer = window.setTimeout(() => setDown(!client.connectionState().isWebSocketConnected), DELAY_MS);
    };
    apply(client.connectionState());
    const off = client.subscribeToConnectionState(apply);
    return () => { clearTimeout(timer); off(); stopOutbox(); };
  }, []);

  if (!down || !deviceHasFamily()) return null;
  return (
    <div className="offline-banner" role="status">
      {t('אין חיבור לשרת. הפנקס האישי ממשיך לעבוד כרגיל. חובות והחזרים חדשים בקופה המשפחתית נשמרים במכשיר ויישלחו כשהחיבור יחזור. שאר השינויים יישלחו רק אם האפליקציה תישאר פתוחה.')}
    </div>
  );
}
