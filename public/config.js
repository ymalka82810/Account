// כתובת הפריסה של Convex (production)
window.CONVEX_URL = "https://flippant-mule-694.eu-west-1.convex.cloud";
// כתובת אימייל לפניות בנושא פרטיות ותנאי שימוש (מוצגת בדפי המדיניות אם מולאה)
window.CONTACT_EMAIL = "malka.applications@gmail.com";
// מפתח ציבורי להתראות (Web Push). המפתח הפרטי נשמר רק בשרת Convex.
window.VAPID_PUBLIC_KEY = "BMAvS9Esvtie9kVeVw1INs-t2mlIBLLRF4hiNzEAENojfVwCrG9ZKBhjSu-TEorWwf1PJdCy67fJxs3HN8WqDSo";
// התראות באפליקציית האנדרואיד (FCM). בבניית ה-APK הערך נקבע אוטומטית: true רק אם קיים הסוד GOOGLE_SERVICES_JSON ב-GitHub,
// אחרת false (בלי Firebase הרישום להתראות נתקע או מקריס). בשרת צריך גם FCM_SERVICE_ACCOUNT (workflow: Set Convex env).
window.FCM_ENABLED = true;
