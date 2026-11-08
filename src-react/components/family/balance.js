import { t } from '../../i18n/index.js';
import { g } from '../../lib/gender.js';

// יתרה של אדם מתוך החובות הפתוחים: חיובי = מגיע לו, שלילי = חייב.
export const balanceOf = (id, debts) =>
  debts.reduce((s, d) => s + (d.creditor === id ? d.amount : d.debtor === id ? -d.amount : 0), 0);

// המלל שמתחת לסכום, לפי הכיוון והמגדר.
export const balanceWhat = (p, v) =>
  (v > 0 ? g(p.gender, 'מגיע לו', 'מגיע לה', 'מגיע לו/ה') : v < 0 ? g(p.gender, 'חייב', 'חייבת', 'חייב/ת') : t('הכול מסודר'));
