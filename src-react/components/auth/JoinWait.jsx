import { useEffect, useState } from 'react';
import { t, tn } from '../../i18n/index.js';
import { useQuery } from '../../lib/api.js';
import { goView, openNotebook } from '../../state/auth.js';
import { state } from '../../state/state.js';
import { clearJoinPending } from '../../lib/joinPending.js';
import { withIcons } from '../shared/UiIcon.jsx';

const SLOW_MIN = 10; // אחרי כמה דקות מציעים לדחוף את ההורה בעצמנו

// כמה זמן עבר, במילים ("ממש עכשיו", "לפני 3 דקות").
function ago(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return t('ממש עכשיו');
  if (min < 60) return t('לפני {n}', { n: tn(min, 'דקה', '{n} דקות') });
  const h = Math.floor(min / 60);
  return t('לפני {n}', { n: tn(h, 'שעה', '{n} שעות') });
}

// שעון שמרענן את התצוגה כל חצי דקה, כדי שה"לפני X דקות" יתקדם גם כשהשרת לא שולח כלום.
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(i); }, []);
  return now;
}

const Row = ({ icon, children, strong }) => (
  <li className={'join-step' + (strong ? ' now' : '')}><span className="join-step-icon" aria-hidden="true">{icon}</span><span>{children}</span></li>
);

/**
 * מסך ההמתנה אחרי בקשת הצטרפות. מתעדכן חי מהשרת (auth:joinStatus) ואומר בכל רגע מה המצב,
 * למה זה לוקח זמן, ומה צריך לקרות בצד השני.
 */
export default function JoinWait({ pending, onNew, askParent }) {
  const now = useNow();
  const st = useQuery('auth:joinStatus', { requestId: pending.requestId });
  const fam = state.fam;
  const done = (to) => { clearJoinPending(); to(); };

  if (st && st.state === 'approved') {
    return (
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🎉</div>
        <h1>{t('אושרת!')}</h1>
        <p className="hint">{t('הורה אישר את ההצטרפות. עכשיו נכנסים: בוחרים את השם שלך ומקלידים את הקוד הסודי שבחרת.')}</p>
        <button className="primary" type="button" onClick={() => done(() => goView(state.fam ? 'login' : 'welcome'))}>{t('כניסה לקופה')}</button>
      </div>
    );
  }
  if (st && st.state === 'rejected') {
    return (
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🚫</div>
        <h1>{t('הבקשה לא אושרה')}</h1>
        <p className="hint">{t('הורה במשפחה דחה את הבקשה. אולי נכתב שם שהם לא מזהים, או שזו לא הייתה הכוונה. כדאי לדבר איתם, ואז אפשר לנסות שוב.')}</p>
        <button className="primary" type="button" onClick={() => done(onNew)}>{t('לנסות שוב')}</button>
        <button className="ghost linkish" type="button" onClick={() => done(() => goView('welcome'))}>{t('חזרה')}</button>
      </div>
    );
  }
  if (st && st.state === 'gone') {
    return (
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">❓</div>
        <h1>{t('הבקשה כבר לא קיימת')}</h1>
        <p className="hint">{t('אין עוד בקשה פתוחה על השם הזה. ייתכן שהיא נמחקה או שהקופה נסגרה. אפשר לשלוח בקשה חדשה.')}</p>
        <button className="primary" type="button" onClick={() => done(onNew)}>{t('בקשה חדשה')}</button>
        <button className="ghost linkish" type="button" onClick={() => done(() => goView('welcome'))}>{t('חזרה')}</button>
      </div>
    );
  }

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const waited = now - (st ? st.createdAt : pending.sentAt);
  const slow = waited >= SLOW_MIN * 60000;
  return (
    <div className="card-narrow">
      <div className="big-emoji" aria-hidden="true">⏳</div>
      <h1>{t('ממתינים לאישור הורה')}</h1>
      <p className="hint">{fam ? t('הבקשה להצטרף לקופה של {name} נשלחה. המסך הזה מתעדכן לבד, אין צורך לרענן.', { name: fam.name }) : t('הבקשה להצטרף לקופה נשלחה. המסך הזה מתעדכן לבד, אין צורך לרענן.')}</p>
      <ul className="join-steps" aria-live="polite">
        <Row icon="✅">{t('הבקשה נשלחה ונשמרה אצל המשפחה')} · {ago(waited)}</Row>
        {!st && <Row icon="🔄">{offline ? t('אין חיבור לאינטרנט. המצב יתעדכן ברגע שהחיבור יחזור.') : t('בודקים מה מצב הבקשה…')}</Row>}
        {st && st.notified && <Row icon="✅">{st.parents > 1 ? t('ההורים קיבלו התראה בטלפון') : t('ההורה קיבל/ה התראה בטלפון')}</Row>}
        {st && !st.notified && <Row icon="⚠️">{t('להורים עוד אין התראות בטלפון, אז הם לא יודעים שביקשת להצטרף. כדאי להודיע להם.')}</Row>}
        {st && <Row icon="⏳" strong>{t('עכשיו תורו של ההורה: לפתוח את האפליקציה, ללשונית ״ניהול״, וללחוץ ״אישור״ ליד השם שלך.')}</Row>}
        {st && <Row icon="🙂">{t('בצד שלך אין מה לעשות. אחרי האישור תוכל/י להיכנס עם הקוד הסודי שבחרת.')}</Row>}
      </ul>
      {slow && <p className="hint">{t('עבר זמן. כנראה ההורה עוד לא ראה את הבקשה. אפשר לשלוח לו הודעה.')}</p>}
      <button className={slow || (st && !st.notified) ? 'primary' : 'ghost'} type="button" onClick={askParent}>{t('💬 שלחו להורה בוואטסאפ')}</button>
      <p className="hint">{t('בינתיים אפשר לרשום בפנקס האישי, שנשמר במכשיר שלך.')}</p>
      <button className="ghost" type="button" onClick={openNotebook}>{withIcons(t('📒 בינתיים, לפנקס האישי'))}</button>
    </div>
  );
}

// שורה קטנה במסך הפתיחה: יש בקשת הצטרפות פתוחה, והמצב שלה. לחיצה פותחת את מסך ההמתנה.
export function JoinPendingChip({ pending }) {
  const st = useQuery('auth:joinStatus', { requestId: pending.requestId });
  const label = !st ? t('בודקים…')
    : st.state === 'pending' ? t('ממתינה לאישור הורה')
    : st.state === 'approved' ? t('אושרה! אפשר להיכנס')
    : st.state === 'rejected' ? t('לא אושרה')
    : t('כבר לא קיימת');
  return (
    <button className="ghost" type="button" onClick={() => goView('join')}>
      {t('בקשת ההצטרפות שלך')}: {label}
    </button>
  );
}
