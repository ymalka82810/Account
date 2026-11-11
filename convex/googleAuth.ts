import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizeEmail, validEmail } from "./lib";
import { proofPurpose, type LinkResult, type ProofResult } from "./googleLink";

// ---------- חשבון גוגל (לכל אחד: הורה, נער/ה, ילד/ה) ----------
// הלקוח מתחבר עם גוגל דרך Firebase Auth ושולח לכאן את ה-ID token. השרת מאמת את החתימה מול המפתחות הציבוריים
// של גוגל, ורק אז מחבר או מאשר. אין שליחת מיילים בכלל.
// FIREBASE_PROJECT_ID (משתנה סביבה ב-Convex) מחליף את ברירת המחדל אם צריך פרויקט אחר.
const DEFAULT_PROJECT = "account-9da16";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
// כניסה עם גוגל חייבת להיות טרייה, כדי שטוקן ישן שדלף לא יספיק לחבר חשבון.
export const GOOGLE_MAX_AGE_SEC = 10 * 60;

export type GoogleIdentity = { sub: string; email: string };

export type GoogleClaims = {
  sub?: string; email?: string; email_verified?: boolean; auth_time?: number;
  firebase?: { sign_in_provider?: string };
};

// בדיקת התביעות (בלי חתימה), נפרדת כדי שאפשר יהיה לבדוק אותה בלי רשת.
export function identityFromClaims(c: GoogleClaims, nowSec: number): GoogleIdentity {
  if (c.firebase?.sign_in_provider !== "google.com") throw new ConvexError("ההתחברות לא בוצעה עם גוגל");
  if (!c.sub || !c.email || c.email_verified !== true) throw new ConvexError("המייל של חשבון הגוגל לא מאומת");
  if (typeof c.auth_time !== "number" || nowSec - c.auth_time > GOOGLE_MAX_AGE_SEC || c.auth_time - nowSec > 60) {
    throw new ConvexError("ההתחברות עם גוגל פגה. נסו שוב");
  }
  const email = normalizeEmail(c.email);
  if (!validEmail(email)) throw new ConvexError("כתובת מייל לא תקינה");
  return { sub: c.sub, email };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const project = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT;
  let claims: GoogleClaims;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
      algorithms: ["RS256"],
    });
    claims = payload as GoogleClaims;
  } catch {
    throw new ConvexError("ההתחברות עם גוגל לא אומתה. נסו שוב");
  }
  return identityFromClaims(claims, Math.floor(Date.now() / 1000));
}

// חיבור (או החלפה, עם changeProof מאימות בחשבון הנוכחי) של חשבון הגוגל לאדם המחובר.
export const link = action({
  args: { token: v.string(), idToken: v.string(), myPin: v.optional(v.string()), changeProof: v.optional(v.string()) },
  handler: async (ctx, { token, idToken, myPin, changeProof }): Promise<LinkResult> => {
    const id = await verifyGoogleIdToken(idToken);
    return await ctx.runMutation(internal.googleLink.applyLink, { token, sub: id.sub, email: id.email, myPin, changeProof });
  },
});

// אימות עם חשבון הגוגל המחובר לפני פעולה רגישה של מי שמחובר/ת. מחזיר קוד חד-פעמי לפעולה עצמה.
export const prove = action({
  args: { token: v.string(), idToken: v.string(), purpose: proofPurpose },
  handler: async (ctx, { token, idToken, purpose }): Promise<ProofResult> => {
    const id = await verifyGoogleIdToken(idToken);
    return await ctx.runMutation(internal.googleLink.issueProof, { token, sub: id.sub, purpose });
  },
});

// אותו דבר לפני כניסה (שכחתי קוד, מכשיר שאבד): לפי קוד המשפחה (או כרטיס מכשיר) והאדם.
export const proveFor = action({
  args: { code: v.string(), personId: v.id("people"), idToken: v.string(), purpose: proofPurpose, device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, idToken, purpose, device }): Promise<ProofResult> => {
    const id = await verifyGoogleIdToken(idToken);
    return await ctx.runMutation(internal.googleLink.issueProof, { code, personId, device, sub: id.sub, purpose });
  },
});
