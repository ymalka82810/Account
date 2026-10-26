import { t } from './index.js';

// הודעות שגיאה מהשרת הן נוסח עברי. רובן קבועות ואז t() מספיק. אלה שיש בהן ערך משתנה
// (סכום, שם, מספר) מזוהות כאן בתבנית ומתורגמות עם הערך.
/** @type {[RegExp, string, string[]][]} */
const PATTERNS = [
  [/^אי אפשר להחזיר יותר ממה שנשאר מהחוב \((.+)\)$/, 'אי אפשר להחזיר יותר ממה שנשאר מהחוב ({amount})', ['amount']],
  [/^קודם צריך לקבוע ל(.+) קוד סודי$/, 'קודם צריך לקבוע ל{name} קוד סודי', ['name']],
  [/^הקוד צריך להיות 4 ספרות לפחות, ועד (\d+)$/, 'הקוד צריך להיות 4 ספרות לפחות, ועד {max}', ['max']],
];

export function translateServer(msg) {
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(msg);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return t(msg);
}
