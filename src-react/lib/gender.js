// צורת פנייה לפי מגדר. חסר (undefined/null) = ללא ציון, וחוזרים לצורה הכפולה (neutral).
export const g = (gender, male, female, neutral) =>
  gender === 'male' ? male : gender === 'female' ? female : neutral;
