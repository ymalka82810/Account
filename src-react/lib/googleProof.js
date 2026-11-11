// אימות עם חשבון הגוגל המחובר לפני פעולה רגישה (שינוי/איפוס קוד, קוד לילד/ה, קישור מכשיר, מכשיר שאבד).
// השרת (googleAuth:prove / proveFor) בודק שזה אותו חשבון ומחזיר קוד חד-פעמי, שמועבר מיד לפעולה עצמה.
import { callAction, deviceId } from './api.js';
import { GoogleError, googleIdToken } from './google.js';
import { errMsg } from './helpers.js';
import { t } from '../i18n/index.js';

/** הודעה למשתמש על כשל בחלון גוגל עצמו. */
export function googleErrMsg(e) {
  if (e instanceof GoogleError) {
    if (e.message === 'NO_CLIENT_ID') return t('חסרה הגדרה של התחברות עם גוגל באפליקציה. בינתיים אפשר מהאתר.');
    if (e.message === 'NO_ACCOUNT') return t('אין בטלפון חשבון גוגל. הוסיפו חשבון בהגדרות הטלפון ונסו שוב.');
  }
  return e && e.data ? errMsg(e) : t('ההתחברות עם גוגל נכשלה. נסו שוב.');
}

/** הודעה על תשובת שרת שלילית לאימות. */
export function proofFailMsg(reason) {
  return reason === 'otherAccount' ? t('זה לא חשבון הגוגל שמחובר אליכם. בחרו את החשבון הנכון.')
    : reason === 'noGoogle' ? t('עוד לא חובר חשבון גוגל.')
      : reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.')
        : t('משהו השתבש. נסו שוב.');
}

/**
 * אימות בגוגל. מחזיר { proof } בהצלחה, { error } בכישלון, או null אם החלון נסגר.
 * @param {string} purpose
 * @param {{ token?: string, code?: string, personId?: string }} who  token = מחובר/ת; code+personId = לפני כניסה
 */
export async function proveWithGoogle(purpose, who) {
  let idToken;
  try { idToken = await googleIdToken(); } catch (e) { return { error: googleErrMsg(e) }; }
  if (!idToken) return null;
  try {
    const res = who.token
      ? await callAction('googleAuth:prove', { token: who.token, idToken, purpose: /** @type {any} */ (purpose) })
      : await callAction('googleAuth:proveFor', { code: who.code, personId: /** @type {any} */ (who.personId), idToken, purpose: /** @type {any} */ (purpose), device: deviceId() });
    if (res.ok) return { proof: res.proof };
    return { error: proofFailMsg(res.reason), reason: res.reason };
  } catch (e) { return { error: googleErrMsg(e) }; }
}
