import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { client } from '../../lib/client.js';
import { deviceHasFamily } from '../../state/auth.js';

// סימון קצר כשאין חיבור לשרת. הפנקס האישי נשמר במכשיר, ולכן לא נחסם ולא תלוי בחיבור.
// מה שהקוד באמת עושה: לקוח Convex שולח מחדש בקשות שינוי שהמתינו כשהחיבור חוזר, אבל רק בזמן שהאפליקציה פתוחה
// (אין תור שנשמר במכשיר). פעולות שרת מסוג action נכשלות ומציגות שגיאה. לכן ההודעה לא מבטיחה יותר מזה.
// מופיע רק במכשיר שיש בו קופה משפחתית, ורק אחרי כמה שניות בלי חיבור, כדי שלא יהבהב בפתיחת האפליקציה.
const DELAY_MS = 4000;

export default function OfflineBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!client) return undefined;
    let timer = 0;
    const apply = (/** @type {{ isWebSocketConnected: boolean }} */ cs) => {
      clearTimeout(timer);
      if (cs.isWebSocketConnected) { setDown(false); return; }
      timer = window.setTimeout(() => setDown(!client.connectionState().isWebSocketConnected), DELAY_MS);
    };
    apply(client.connectionState());
    const off = client.subscribeToConnectionState(apply);
    return () => { clearTimeout(timer); off(); };
  }, []);

  if (!down || !deviceHasFamily()) return null;
  return (
    <div className="offline-banner" role="status">
      {t('אין חיבור לשרת. הפנקס האישי ממשיך לעבוד כרגיל. שינויים בקופה המשפחתית יישלחו כשהחיבור יחזור, אבל רק אם האפליקציה תישאר פתוחה.')}
    </div>
  );
}
