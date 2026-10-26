// כללי הקוד הסודי, זהים לשרת (convex/lib.ts). ילדים ונוער: בדיוק 4 ספרות.
// הורים מאשרים כסף, אז מותר להם קוד ארוך יותר.
export const PARENT_PIN_MAX = 8;
export const pinMax = (role) => (role === 'parent' ? PARENT_PIN_MAX : 4);
export const pinOk = (pin, role) => (role === 'parent' ? /^\d{4,8}$/ : /^\d{4}$/).test(pin);
export const pinLabel = (role) => (role === 'parent' ? `4 עד ${PARENT_PIN_MAX} ספרות` : '4 ספרות');
