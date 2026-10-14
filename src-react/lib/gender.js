// צורת פנייה לפי מגדר. חסר (undefined/null) = ללא ציון, וחוזרים לצורה הכפולה (neutral).
export const g = (gender, male, female, neutral) =>
  gender === 'male' ? male : gender === 'female' ? female : neutral;

export const GENDER_OPTIONS = [
  { value: '', label: 'ללא ציון' },
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
];
