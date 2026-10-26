// תחליף ל-convex/_generated בזמן בדיקות. התיקייה האמיתית נוצרת ע"י `convex dev` ואינה ב-git,
// וה-CI לא מריץ אותה. מה שהקוד צריך בזמן ריצה הוא רק אלה (הטיפוסים נמחקים בקומפילציה).
export const server = `
import { actionGeneric, internalActionGeneric, internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server";
export const query = queryGeneric;
export const mutation = mutationGeneric;
export const action = actionGeneric;
export const internalQuery = internalQueryGeneric;
export const internalMutation = internalMutationGeneric;
export const internalAction = internalActionGeneric;
`;
export const api = `
import { anyApi } from "convex/server";
export const api = anyApi;
export const internal = anyApi;
`;
