import { t } from '../../i18n/index.js';
import { logout } from './AccountSheet.jsx';
import FirstBindForm from './FirstBind.jsx';

// מסך חוסם להורה שהמכשיר שלו עוד לא קשור: אי אפשר להמשיך כהורה לפני הקישור.
export default function DeviceGate() {
  return (
    <main>
      <div className="card-narrow" style={{ margin: '2rem auto' }}>
        <div className="big-emoji" aria-hidden="true">📱</div>
        <h1>{t('קישור המכשיר להורה')}</h1>
        <FirstBindForm onDone={() => { /* השאילתה מתעדכנת, והמסך הראשי נפתח */ }} />
        <button className="ghost linkish" type="button" onClick={() => logout()}>{t('יציאה')}</button>
      </div>
    </main>
  );
}
