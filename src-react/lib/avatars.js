import { useEffect, useState } from 'react';
import { AVATARS, PARENT_AVATARS } from '../state/state.js';

// תמונות הפלסטלינה של הדמויות (public/avatars/<key>.webp, מ-scripts/blender/avatars.py).
// ערך שאינו ברשימה (דמות ישנה, ברירת המחדל, סימן ➕) נשאר אימוג'י רגיל.
const KNOWN = new Set([...AVATARS, ...PARENT_AVATARS]);

/** שם הקובץ של דמות: הקודים בהקסה מופרדים ב-'-', בלי FE0F (כמו key_of ב-scripts/blender/avatars_prep.py). */
const avatarKey = (/** @type {string} */ a) => Array.from(a, (c) => /** @type {number} */ (c.codePointAt(0))).filter((c) => c !== 0xfe0f).map((c) => c.toString(16)).join('-');

/** @param {string | null | undefined} a @returns {string | null} */
export const avatarUrl = (a) => (a && KNOWN.has(a) ? `avatars/${avatarKey(a)}.webp` : null);

/** @type {Map<string, Promise<boolean>>} */
const loading = new Map();
/** כתובות שכבר נטענו ופוענחו - מציגים אותן מיד, בלי ריבוע ריק */
/** @type {Set<string>} */
const ready = new Set();
// הפניה לתמונות כדי שלא ייזרקו מהזיכרון לפני שהוצגו (כמו ב-preloadImages.js)
/** @type {HTMLImageElement[]} */
const kept = [];

/** @param {string | null | undefined} a */
export const avatarReady = (a) => { const u = avatarUrl(a); return !!u && ready.has(u); };

/** @param {string} url @returns {Promise<boolean>} */
function loadUrl(url) {
  let p = loading.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      kept.push(img);
      img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { ready.add(url); resolve(true); }); };
      img.onerror = () => { loading.delete(url); resolve(false); }; // כישלון לא נשמר, כדי שאפשר יהיה לנסות שוב
      img.src = new URL(url, document.baseURI).href;
    });
    loading.set(url, p);
  }
  return p;
}

/** @param {string | null | undefined} a */
export const loadAvatar = (a) => { const u = avatarUrl(a); return u ? loadUrl(u) : Promise.resolve(false); };

// אם אין חיבור או שתמונה תקועה, לא חוסמים את האפליקציה יותר מזה.
const TIMEOUT_MS = 4000;

/** טעינה מוקדמת (כולל פענוח) של דמויות, כדי שהמסך הראשון לא יוצג לפני שהן מוכנות. @param {(string | null | undefined)[]} list */
export function preloadAvatars(list) {
  const all = Promise.all([...new Set(list.filter(Boolean))].map(loadAvatar));
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  return Promise.race([all, timeout]);
}

/**
 * true אחרי שדמויות בני המשפחה נטענו (או שחלף הזמן). נבדק פעם אחת לכל כניסה:
 * החלפת דמות אחר כך לא מחזירה את מסך הטעינה.
 * @param {string | null | undefined} token @param {(string | null | undefined)[]} list
 */
export function useAvatarsReady(token, list) {
  const key = list.filter(Boolean).join('|');
  const [doneFor, setDoneFor] = useState('');
  useEffect(() => {
    if (!token || !key) return undefined;
    let alive = true;
    preloadAvatars(list).then(() => { if (alive) setDoneFor(token); });
    return () => { alive = false; };
  }, [token, key]);
  return !key || doneFor === token;
}
