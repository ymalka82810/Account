// import.meta.env של Vite ודגלי הבדיקה (src-react/App.jsx). אין בפרויקט @types/react או vite/client, ולכן מצהירים כאן רק על מה שבשימוש.
// הדגלים נקראים רק כש-import.meta.env.DEV, ולכן אינם קיימים בבנייה לייצור.
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
interface Window {
  __kupaCrash?: string;
  __kupaStallMs?: number;
}
