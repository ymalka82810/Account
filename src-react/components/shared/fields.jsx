import { PARENT_PIN_MAX } from '../../lib/pin.js';
import { t } from '../../i18n/index.js';

// placeholder הוא getter כדי שהתרגום ייקרא בכל פעם שהאובייקט נפרס (שפה יכולה להתחלף).
export const codeProps = { type: 'text', inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code', get placeholder() { return t('6 ספרות'); }, dir: 'ltr' };
// max: אורך הקוד המרבי בשדה. שדה של קוד קיים (current-password) צריך להתאים גם להורה עם קוד ארוך.
export const pinProps = (ac, max) => ({ type: 'password', inputMode: 'numeric', maxLength: max ?? (ac === 'current-password' ? PARENT_PIN_MAX : 4), autoComplete: ac });
export const Err = ({ children }) => <p className="error" role="alert">{children}</p>;
export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
