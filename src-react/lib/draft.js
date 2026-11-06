// טיוטת טופס: מה שהוקלד נשמר במכשיר, כדי שרענון או סגירת האפליקציה באמצע לא ימחקו אותו.
// נשמרים רק שדות טקסט רגילים שהקורא בוחר במפורש. לעולם לא קוד סודי, קוד מייל או כל קוד אחר.
// הטיוטה נמחקת אחרי שמירה מוצלחת ואחרי ביטול מפורש (סגירת הטופס). טיוטה ישנה מדי נזרקת.
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export const NB_DRAFT_KEY = 'kupa-draft-notebook';
export const SETUP_DRAFT_KEY = 'kupa-draft-setup';

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const d = JSON.parse(raw);
    if (d && d.v && typeof d.v === 'object' && Date.now() - d.at < MAX_AGE) return d.v;
    localStorage.removeItem(key); // פגה או לא תקינה: לא משאירים במכשיר
  } catch (e) { clearDraft(key); /* פגום או אין גישה: אין טיוטה */ }
  return null;
}

// ערכים ריקים לגמרי לא נשמרים (ומוחקים טיוטה קיימת): אין מה לשחזר.
export function saveDraft(key, value, ignore = []) {
  try {
    const empty = Object.entries(value).every(([k, v]) => ignore.includes(k) || !String(v ?? '').trim());
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ v: value, at: Date.now() }));
  } catch (e) { /* אין מקום או מצב פרטי: ממשיכים בלי טיוטה */ }
}

export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch (e) { /* */ }
}
