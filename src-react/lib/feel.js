// "תחושה": צליל, רטט והפחתת תנועה. שלוש העדפות מקומיות של המכשיר (לא נשמרות בשרת), כל אחת ב-localStorage.
// הכול בתוך try/catch: במצב פרטי או כשהאחסון חסום ההעדפה פשוט לא נשמרת, והאפליקציה ממשיכה עם ברירת המחדל.
// המפתחות 'kupa-vibrate' ו-'kupa-kb-sound' קיימים מהגרסאות הקודמות ('0' = כבוי), ולכן נשארו כמו שהם.
export const SOUND_KEY = 'kupa-sound';
export const VIBRATE_KEY = 'kupa-vibrate';
export const MOTION_KEY = 'kupa-motion';

const read = (/** @type {string} */ k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (/** @type {string} */ k, /** @type {string} */ v) => { try { localStorage.setItem(k, v); } catch (e) { /* מצב פרטי */ } };

// צליל: מתג אחד לכל הצלילים (מטבעות, מקלדת, מטילים). ברירת מחדל: פעיל.
export const soundOn = () => read(SOUND_KEY) !== '0';
export const setSound = (/** @type {boolean} */ on) => write(SOUND_KEY, on ? '1' : '0');

export const vibrateOn = () => read(VIBRATE_KEY) !== '0';
export const setVibrate = (/** @type {boolean} */ on) => write(VIBRATE_KEY, on ? '1' : '0');

// הפחתת תנועה: 'system' (לפי המכשיר) | 'on' (תמיד מופחתת) | 'off' (תנועה מלאה גם אם המכשיר מבקש הפחתה).
export const MOTION_MODES = /** @type {const} */ (['system', 'off', 'on']);
export const motionMode = () => { const v = read(MOTION_KEY); return v === 'on' || v === 'off' ? v : 'system'; };

// data-motion על ה-body (ראו style.css): "off" = בלי תנועה (הפחתה מופעלת), "on" = תנועה מלאה גם כשהמכשיר מבקש הפחתה.
// במצב 'system' אין מאפיין, וההכרעה היא של @media (prefers-reduced-motion).
export function applyMotion() {
  const m = motionMode();
  if (m === 'system') delete document.body.dataset.motion;
  else document.body.dataset.motion = m === 'on' ? 'off' : 'on';
}
export function setMotion(/** @type {'system' | 'on' | 'off'} */ mode) {
  if (mode === 'system') { try { localStorage.removeItem(MOTION_KEY); } catch (e) { /* מצב פרטי */ } } else write(MOTION_KEY, mode);
  applyMotion();
}

// המקור היחיד לשאלה "האם להפחית תנועה": ההעדפה באפליקציה, ואם היא "לפי המכשיר" - הגדרת המערכת.
// כל קוד JS שמחליט על אנימציה (ספירת סכום, מטילים עפים, גלגל ההגדרות) שואל כאן ולא ב-matchMedia ישירות.
export function reducedMotion() {
  const m = motionMode();
  if (m !== 'system') return m === 'on';
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
