import { createContext, useContext } from 'react';

// מה שכל המסכים צריכים מה-App: הנתונים, ה-token, מעבר בין לשוניות ופתיחת האשף.
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
