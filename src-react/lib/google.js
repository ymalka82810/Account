// התחברות עם גוגל דרך Firebase Auth. הלקוח רק מקבל ID token, והשרת מאמת אותו (convex/googleAuth.ts).
// ההגדרות כאן ציבוריות (מזהים, לא סודות). הספרייה נטענת רק כשלוחצים על הכפתור, כדי לא להכביד על הטעינה.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD68mkv5l09nW3I05gpa7bU7dU12iB3pUc',
  authDomain: 'account-9da16.firebaseapp.com',
  projectId: 'account-9da16',
  appId: '1:177822034515:web:60865700b107a90bd834a6',
};

// בחלון קופץ של דפדפן. באפליקציית האנדרואיד (WebView) זה לא עובד, שם יידרש תוסף מקומי.
export const googleAvailable = () => !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

/** פותח בחירת חשבון גוגל ומחזיר ID token טרי. null אם המשתמש סגר את החלון. */
export async function googleIdToken() {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import('firebase/auth');
  const auth = getAuth(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken();
    // הכניסה לפיירבייס נועדה רק להוכחת הזהות. לא משאירים אותה פתוחה במכשיר.
    await signOut(auth).catch(() => {});
    return idToken;
  } catch (e) {
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return null;
    throw e;
  }
}
