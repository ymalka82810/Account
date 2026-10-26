// כללי הקוד הסודי, זהים לשרת (convex/lib.ts). ילדים ונוער: בדיוק 4 ספרות.
// הורים מאשרים כסף, אז מותר להם קוד ארוך יותר.
import { t } from '../i18n/index.js';

export const PARENT_PIN_MAX = 8;
export const pinMax = (role) => (role === 'parent' ? PARENT_PIN_MAX : 4);
export const pinOk = (pin, role) => (role === 'parent' ? /^\d{4,8}$/ : /^\d{4}$/).test(pin);
export const pinLabel = (role) => (role === 'parent' ? t('4 עד {max} ספרות', { max: PARENT_PIN_MAX }) : t('4 ספרות'));
