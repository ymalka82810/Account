import { t } from '../i18n/index.js';

// צורת פנייה לפי מגדר. חסר (undefined/null) = ללא ציון, וחוזרים לצורה הכפולה (neutral).
// הצורות הן מפתחות תרגום (עם {פרמטרים} אופציונליים). שפה בלי מגדר דקדוקי מתרגמת את שלושתן לאותו נוסח.
export const g = (gender, male, female, neutral, params) => {
  const s = gender === 'male' ? male : gender === 'female' ? female : neutral;
  return typeof s === 'string' ? t(s, params) : s;
};

// getter: התווית נקראת בזמן הרינדור, כדי שתתורגם לשפה הנוכחית.
export const GENDER_OPTIONS = [
  { value: '', get label() { return t('ללא ציון'); } },
  { value: 'male', get label() { return t('זכר'); } },
  { value: 'female', get label() { return t('נקבה'); } },
];
