import { useCallback } from 'react';
import { t } from '../../i18n/index.js';
import { enablePush, permissionState } from '../../lib/push.js';
import { useConfirm } from '../shared/Confirm.jsx';
import { withIcons } from '../shared/UiIcon.jsx';

// הפעלת התראות עם חלון הסבר בעיצוב האפליקציה לפני חלון ההרשאה של אנדרואיד/הדפדפן (שאי אפשר לעצב).
// חלון המערכת מופיע רק אחרי "כן, להפעיל". "לא עכשיו" לא חוסם כלום, בניגוד ל"לא, אף פעם" בחלון המערכת.
// מחזיר '' בהצלחה, טקסט שגיאה בכישלון, או null אם בחרו "לא עכשיו".
export function useEnablePush() {
  const confirm = useConfirm();
  return useCallback(async (/** @type {(text: string) => void} */ onProgress) => {
    if ((await permissionState()) === 'prompt') {
      const yes = await confirm({
        icon: withIcons('🔔'),
        title: t('להפעיל התראות?'),
        message: t('נשלח לטלפון הודעה כשנרשם חוב שקשור אליך או כשמשהו ממתין לאישור שלך.\nאחרי "כן" הטלפון ישאל פעם אחת אם לאשר.'),
        okText: t('כן, להפעיל'),
        cancelText: t('לא עכשיו'),
      });
      if (!yes) return null;
    }
    return enablePush(onProgress);
  }, [confirm]);
}
