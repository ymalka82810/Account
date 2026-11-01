import { intlLocale } from '../i18n/index.js';

// תאריך ושעה קצרים לפי שפת המסך, למשל "3 בנוב׳, 14:05".
export const fmtWhen = (ts) =>
  new Date(ts).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
