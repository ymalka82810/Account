import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { alertLock } from "./alerts";
import { CodePurpose, issueLocalCode, verifyCode } from "./authCodes";
import { openSession, setPin } from "./auth";
import { isBound } from "./biometric";
import {
  PROOF_LIMIT, PROOF_TTL_MS, PROOF_WINDOW_MS, codeThrottled, failCode, findFamilyByCode, hashToken, isThrottled, noteHit, pinRuleMessage,
  registerPinFail, requirePerson, validPin, verifyPin,
} from "./lib";

// החלק של חשבון הגוגל שכותב למסד. בקובץ נפרד מ-googleAuth.ts (שמאמת את הטוקן ברשת), כדי שטיפוסי ה-api לא יהיו מעגליים.
//
// כל אחד (הורה, נער/ה, ילד/ה) יכול לחבר חשבון גוגל. מי שחיבר, מאשר בו את מה שפעם אושר בקוד מהמייל:
// שינוי ואיפוס של הקוד הסודי, קוד חדש לילד/ה (הורה), קישור מכשיר ראשון והחלפת מכשיר שאבד (הורה).
// האימות: חלון גוגל טרי -> השרת בודק שזה אותו חשבון שמחובר (googleSub) -> מונפק קוד חד-פעמי קצר (proof)
// שהלקוח מעביר מיד לפעולה עצמה. הקוד לא נשלח בשום ערוץ.

// reason? בשני הצדדים: הלקוח ב-JS (בלי strict) לא מצמצם איחוד לפי ok, והשדות האופציונליים מאפשרים לקרוא reason בלי שגיאה.
export type LinkResult =
  | { ok: true; email: string; reason?: undefined }
  | { ok: false; reason: "myPin" | "locked" | "otherAccount" | "taken"; email?: undefined };

export type ProofResult =
  | { ok: true; proof: string; reason?: undefined }
  | { ok: false; reason: "noGoogle" | "otherAccount" | "throttled" | "code" | "role"; proof?: undefined };

// הקוד הסודי של האדם עצמו, כאישור (בחיבור ראשון). מחזיר null כשהוא נכון.
async function checkMyPin(ctx: MutationCtx, me: Doc<"people">, myPin: string | undefined): Promise<"myPin" | "locked" | null> {
  if (!me.pinHash || !me.pinSalt) return null; // נכנס/ת בלי קוד: אין מה לאשר
  if (!myPin) return "myPin";
  if (me.lockedUntil && me.lockedUntil > Date.now()) return "locked";
  if (!(await verifyPin(myPin, me.pinSalt, me.pinHash))) {
    const r = await registerPinFail(ctx, me);
    if (r.locked) await alertLock(ctx, me);
    return "myPin";
  }
  return null;
}

export const applyLink = internalMutation({
  args: { token: v.string(), sub: v.string(), email: v.string(), myPin: v.optional(v.string()), changeProof: v.optional(v.string()) },
  handler: async (ctx, { token, sub, email, myPin, changeProof }): Promise<LinkResult> => {
    const me = await requirePerson(ctx, token);
    // חשבון גוגל אחד מחובר לאדם אחד.
    const sameSub = await ctx.db.query("people").filter((q) => q.eq(q.field("googleSub"), sub)).first();
    if (sameSub && sameSub._id !== me._id) return { ok: false as const, reason: "taken" as const };
    if (me.googleSub && me.googleSub !== sub) {
      // החלפת חשבון: קודם מאמתים בחשבון הנוכחי (prove עם emailChange), כדי שמי שמחזיק סשן פתוח לא יחליף לחשבון שלו.
      if (!changeProof || !(await verifyCode(ctx, me._id, "emailChange", changeProof))) return { ok: false as const, reason: "otherAccount" as const };
    } else if (!me.googleSub) {
      // חיבור ראשון: הקוד הסודי של האדם עצמו, מאותה סיבה.
      const bad = await checkMyPin(ctx, me, myPin);
      if (bad) return { ok: false as const, reason: bad };
    }
    await ctx.db.patch(me._id, { email, googleSub: sub, emailVerified: undefined, pendingEmail: undefined });
    return { ok: true as const, email };
  },
});

// מה מותר לאשר עם גוגל. pre = לפני כניסה (קוד משפחה + אדם), in = מחובר/ת (סשן).
const PURPOSES: Record<string, { when: "pre" | "in"; parentOnly: boolean }> = {
  pinChange: { when: "in", parentOnly: false },
  emailChange: { when: "in", parentOnly: false },
  childReset: { when: "in", parentOnly: true },
  deviceFirst: { when: "in", parentOnly: true },
  pinReset: { when: "pre", parentOnly: false },
  deviceRecovery: { when: "pre", parentOnly: true },
};
export const proofPurpose = v.union(
  v.literal("pinChange"), v.literal("emailChange"), v.literal("childReset"), v.literal("deviceFirst"),
  v.literal("pinReset"), v.literal("deviceRecovery"),
);

// אחרי שהטוקן של גוגל אומת (googleAuth.prove / proveFor): בודק שזה החשבון שמחובר לאדם ומנפיק קוד חד-פעמי.
export const issueProof = internalMutation({
  args: {
    sub: v.string(), purpose: proofPurpose,
    token: v.optional(v.string()),
    code: v.optional(v.string()), personId: v.optional(v.id("people")), device: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<ProofResult> => {
    const rule = PURPOSES[a.purpose];
    let p: Doc<"people">;
    if (rule.when === "in") {
      if (!a.token) throw new ConvexError("צריך להיכנס מחדש");
      p = await requirePerson(ctx, a.token);
    } else {
      if (await codeThrottled(ctx, a.device)) return { ok: false as const, reason: "throttled" as const };
      const found = a.code ? await findFamilyByCode(ctx, a.code) : null;
      const person = a.personId ? await ctx.db.get(a.personId) : null;
      if (!found || !person || person.familyId !== found.family._id) {
        await failCode(ctx, a.device);
        return { ok: false as const, reason: "code" as const };
      }
      p = person;
    }
    if (rule.parentOnly && p.role !== "parent") return { ok: false as const, reason: "role" as const };
    if (!p.googleSub) return { ok: false as const, reason: "noGoogle" as const };
    const key = "proof:" + p._id;
    if (await isThrottled(ctx, key, PROOF_LIMIT, PROOF_WINDOW_MS)) return { ok: false as const, reason: "throttled" as const };
    await noteHit(ctx, key, PROOF_WINDOW_MS);
    if (p.googleSub !== a.sub) return { ok: false as const, reason: "otherAccount" as const };
    return { ok: true as const, proof: await issueLocalCode(ctx, p, a.purpose as CodePurpose, PROOF_TTL_MS) };
  },
});

// ---------- שינוי קוד סודי (מחובר/ת) באישור גוגל ----------
export const changePinWithProof = mutation({
  args: { token: v.string(), proof: v.string(), newPin: v.string() },
  handler: async (ctx, { token, proof, newPin }) => {
    const me = await requirePerson(ctx, token);
    if (!validPin(newPin, me.role)) throw new ConvexError(pinRuleMessage(me.role));
    if (!(await verifyCode(ctx, me._id, "pinChange", proof))) return { ok: false as const, reason: "proof" as const };
    await setPin(ctx, me._id, newPin);
    // מנתקים מכשירים אחרים, משאירים את הנוכחי.
    const current = await hashToken(token);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", me._id)).collect()) {
      if (s.tokenHash !== current) await ctx.db.delete(s._id);
    }
    return { ok: true as const };
  },
});

// ---------- שכחתי קוד (לפני כניסה) באישור גוגל ----------
export const resetWithProof = mutation({
  args: { code: v.string(), personId: v.id("people"), proof: v.string(), newPin: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, proof, newPin, device }) => {
    if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    const p = await ctx.db.get(personId);
    if (!found || !p || p.familyId !== found.family._id) return await failCode(ctx, device);
    if (!validPin(newPin, p.role)) throw new ConvexError(pinRuleMessage(p.role));
    if (!(await verifyCode(ctx, p._id, "pinReset", proof))) return { ok: false as const, reason: "proof" as const };
    await setPin(ctx, p._id, newPin);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
      await ctx.db.delete(s._id);
    }
    // הורה שקשור למכשיר נכנס רק מהמכשיר שלו (עם חתימה), לכן איפוס הקוד לא פותח לו סשן כאן.
    if (p.role === "parent" && await isBound(ctx, p._id)) return { ok: true as const, token: undefined };
    return { ok: true as const, token: await openSession(ctx, p._id) };
  },
});
