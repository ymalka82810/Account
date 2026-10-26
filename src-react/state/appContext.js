import { createContext, useContext } from 'react';

/** @typedef {Extract<import('../lib/apiTypes').ReturnOf<'data:get'>, { legacy: false }>} FamilyData נתוני המשפחה כפי ש-convex/data.ts מחזיר */
/**
 * @typedef {object} AppContext
 * @property {FamilyData} data
 * @property {import('../lib/apiTypes').ReturnOf<'friends:get'> | null} fdata
 * @property {string} token
 * @property {FamilyData['me']['id']} me
 * @property {boolean} isParent
 * @property {(tab: string) => void} setTab
 * @property {(opts: any) => void} openEntryFlow
 * @property {import('../lib/apiTypes').ReturnOf<'fx:rates'> | undefined} fx
 */

// מה שכל המסכים צריכים מה-App: הנתונים, ה-token, מעבר בין לשוניות ופתיחת האשף.
export const AppCtx = createContext(null);
/** @returns {AppContext} */
export const useApp = () => useContext(AppCtx);
