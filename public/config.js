// כתובת הפריסה של Convex (production)
window.CONVEX_URL = "https://flippant-mule-694.eu-west-1.convex.cloud";
// כתובת אימייל לפניות בנושא פרטיות ותנאי שימוש (מוצגת בדפי המדיניות אם מולאה)
window.CONTACT_EMAIL = "malka.applications@gmail.com";
// מפתח ציבורי להתראות (Web Push). המפתח הפרטי נשמר רק בשרת Convex.
window.VAPID_PUBLIC_KEY = "BMAvS9Esvtie9kVeVw1INs-t2mlIBLLRF4hiNzEAENojfVwCrG9ZKBhjSu-TEorWwf1PJdCy67fJxs3HN8WqDSo";
// התראות באפליקציית האנדרואיד (FCM). להפוך ל-true רק אחרי שהוגדר Firebase: קובץ google-services.json ב-android/app,
// ומשתנה FCM_SERVICE_ACCOUNT בשרת Convex. בלי זה האפליקציה לא מבקשת רישום להתראות (אחרת היא עלולה לקרוס).
window.FCM_ENABLED = true;
