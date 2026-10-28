import { t } from '../../i18n/index.js';
import { useSheetTitle } from '../shared/Sheet.jsx';

// קוד קישור שהורה קשור הנפיק להורה אחר: מוסרים אותו ביד. תקף 30 דקות ופעם אחת.
export function BindCodeSheet({ code, name }) {
  useSheetTitle(t('קוד קישור ל{name}', { name }));
  return (
    <div className="form">
      <div className="big-emoji" style={{ letterSpacing: '.3em', direction: 'ltr' }} aria-label={t('קוד קישור')}>{code}</div>
      <p className="hint">{t('מסרו את הקוד ל{name} ביד, לא בהודעה. הוא תקף 30 דקות ופעם אחת.', { name })}</p>
      <p className="hint">{t('ההמשך במכשיר של {name}: פותחים את הקופה, בוחרים את {name}, לוחצים על "מכשיר חדש / החלפת מכשיר", ומקלידים את הקוד הסודי של {name} ואת הקוד הזה. מאותו רגע {name} נכנס/ת כהורה רק מהמכשיר הזה.', { name })}</p>
    </div>
  );
}
