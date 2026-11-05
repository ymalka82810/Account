import { t } from '../../i18n/index.js';
import { withIcons } from './UiIcon.jsx';

// מסך "אין חיבור": מוצג כשהטעינה הראשונית נמשכת יותר מדי כי השרת לא עונה (App.jsx: stalled).
// הפנקס האישי נשמר במכשיר ועובד בלי שרת, ולכן תמיד אפשר לפתוח אותו מכאן.
// כשהחיבור חוזר בעצמו App.jsx מסיר את המסך, בלי שהמשתמש צריך ללחוץ על משהו.
export default function NoConnection({ onRetry, onNotebook }) {
  return (
    <section id="screen-offline" className="screen center active">
      <div className="card-narrow" role="status">
        <img className="big-coin" src="coin.webp" alt="" width="68" height="68" draggable="false" />
        <h1>{t('אין חיבור לשרת')}</h1>
        <p className="hint">{t('לא הצלחנו להתחבר כרגע. המסך הזה ייעלם מעצמו כשהחיבור יחזור, ובינתיים הפנקס האישי עובד גם בלי חיבור.')}</p>
        <div className="welcome-actions">
          <button className="primary" type="button" onClick={onRetry}>{t('ניסיון חוזר')}</button>
          <button className="ghost" type="button" onClick={onNotebook}>{withIcons(t('📒 הפנקס שלי'))}</button>
        </div>
      </div>
    </section>
  );
}
