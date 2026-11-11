// התחברות עם גוגל דרך Firebase Auth. הלקוח רק מקבל ID token, והשרת מאמת אותו (convex/googleAuth.ts).
// ההגדרות כאן ציבוריות (מזהים, לא סודות). הספרייה נטענת רק כשצריך, כדי לא להכביד על הטעינה.
//   באתר: חלון קופץ של גוגל.
//   באפליקציה: גוגל חוסמת חלונות התחברות בתוך WebView, ולכן הפלאגין GoogleSignIn (android-plugin/GoogleSignInPlugin.java)
//   מציג את בחירת החשבון של אנדרואיד ומחזיר Google ID token, וכאן מחליפים אותו ב-Firebase ID token.
import { isNativeApp } from './updater.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD68mkv5l09nW3I05gpa7bU7dU12iB3pUc',
  authDomain: 'account-9da16.firebaseapp.com',
  projectId: 'account-9da16',
  appId: '1:177822034515:web:60865700b107a90bd834a6',
};

export class GoogleError extends Error {}

async function firebaseAuth() {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } = await import('firebase/auth');
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  // בזיכרון בלבד: הכניסה לפיירבייס נועדה רק להוכחת הזהות, ולא נשארת במכשיר.
  try { return initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver }); }
  catch (e) { const { getAuth } = await import('firebase/auth'); return getAuth(app); }
}

async function nativeIdToken() {
  const cap = /** @type {any} */ (window).Capacitor;
  try {
    const res = await cap.nativePromise('GoogleSignIn', 'signIn', {});
    return res.idToken;
  } catch (e) {
    const code = e && e.code;
    if (code === 'CANCELLED') return null;
    throw new GoogleError(code === 'NO_CLIENT_ID' ? 'NO_CLIENT_ID' : code === 'NO_ACCOUNT' ? 'NO_ACCOUNT' : 'FAILED');
  }
}

/** פותח בחירת חשבון גוגל ומחזיר Firebase ID token טרי. null אם המשתמש סגר את החלון. */
export async function googleIdToken() {
  const auth = await firebaseAuth();
  const { GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut } = await import('firebase/auth');
  try {
    let user;
    if (isNativeApp) {
      const googleToken = await nativeIdToken();
      if (!googleToken) return null;
      user = (await signInWithCredential(auth, GoogleAuthProvider.credential(googleToken))).user;
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      user = (await signInWithPopup(auth, provider)).user;
    }
    const idToken = await user.getIdToken();
    await signOut(auth).catch(() => {});
    return idToken;
  } catch (e) {
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return null;
    throw e;
  }
}
