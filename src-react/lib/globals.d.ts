// משתנים שנטענים מ-config.js / Capacitor ולא מוגדרים בטיפוסי הדפדפן.
export {};
declare global {
  interface Window {
    CONVEX_URL?: string;
    VAPID_PUBLIC_KEY?: string;
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
