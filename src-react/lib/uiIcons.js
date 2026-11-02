// אייקוני הממשק מ-Blender (public/ui/<name>.webp). כל רינדור מחדש: מעלים את UI_ICON_VERSION
// (וגם את ?v= ב-public/sw.js), כדי שדפדפן עם קובץ ישן במטמון יבקש את החדש.
export const UI_ICON_VERSION = 3;
export const UI_ICON_NAMES = /** @type {const} */ (['fly-money', 'handshake', 'money-bag', 'scroll', 'notebook', 'family']);
/** @param {string} name */
export const uiIconUrl = (name) => `ui/${name}.webp?v=${UI_ICON_VERSION}`;
