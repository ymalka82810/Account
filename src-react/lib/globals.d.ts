// משתנים שנטענים מ-config.js / Capacitor ולא מוגדרים בטיפוסי הדפדפן.
export {};
declare global {
  /** מזהה הבנייה (תאריך · קומיט), מוזרק ב-vite.config.js */
  const __APP_BUILD__: string;
  interface Window {
    CONVEX_URL?: string;
    VAPID_PUBLIC_KEY?: string;
    FCM_ENABLED?: boolean;
    Capacitor?: any;
  }
  interface Navigator {
    userAgentData?: { platform?: string; mobile?: boolean };
  }
}

// בלי @types/react, כדי ש-key יהיה מותר על רכיבים בלי טיפוס props.
declare global {
  namespace JSX {
    interface IntrinsicAttributes { key?: string | number | null }
  }
}
