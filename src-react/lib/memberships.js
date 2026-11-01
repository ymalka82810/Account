// המשפחות שהמכשיר הזה מחובר אליהן (ילד/ה בהורים גרושים שייך/ת לשתי משפחות).
// הרשימה נשמרת רק במכשיר של הילד/ה. השרת לא מקשר בין המשפחות, וההורים של כל משפחה לא יודעים על האחרת.
// לכל משפחה יש רשומת אדם משלה בשרת, ולכן גם עותק פנקס משלה (notebooks), שהורי אותה משפחה בלבד יכולים לצפות בו.
// המפתח הוא מזהה האדם (לא הטוקן), כך שכניסה חדשה לאותה משפחה מחליפה את הטוקן הישן.

export const MEMBERSHIPS_KEY = 'kupa-memberships';
const MAX_MEMBERSHIPS = 5;

/** @typedef {{ personId: string, token: string, familyName: string, name: string, avatar: string, role: string, shared: boolean }} Membership */

/** @returns {Membership[]} */
export function getMemberships() {
  try {
    const list = JSON.parse(localStorage.getItem(MEMBERSHIPS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((m) => m && m.personId && m.token) : [];
  } catch (e) { return []; }
}

function save(list) {
  try { localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(list)); } catch (e) { /* מצב פרטי */ }
}

/** @param {Membership} m */
export function upsertMembership(m) {
  const list = getMemberships();
  const i = list.findIndex((x) => x.personId === m.personId);
  if (i >= 0) {
    const old = list[i];
    if (JSON.stringify(old) === JSON.stringify(m)) return;
    list[i] = m;
  } else {
    list.push(m);
  }
  save(list.slice(-MAX_MEMBERSHIPS));
}

/** מסיר לפי טוקן (יציאה, או טוקן שפג) */
export function forgetMembershipByToken(token) {
  const list = getMemberships();
  const next = list.filter((m) => m.token !== token);
  if (next.length !== list.length) save(next);
}

/** כל המשפחות מלבד זו של הטוקן הנוכחי */
export const otherMemberships = (token) => getMemberships().filter((m) => m.token !== token);

/** משפחות שהילד/ה אישר/ה בהן שההורים יראו את הפנקס, ולכן הפנקס צריך להישלח אליהן */
export const syncTargets = () => getMemberships().filter((m) => m.role === 'child' && m.shared);
