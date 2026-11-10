import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { registerPinFail, requirePerson, verifyPin } from "./lib";

// reason?/email? בשני הצדדים: הלקוח ב-JS (בלי strict) לא מצמצם איחוד לפי ok, והשדות האופציונליים מאפשרים לקרוא reason בלי שגיאה.
export type LinkResult =
  | { ok: true; email: string; reason?: undefined }
  | { ok: false; reason: "myPin" | "locked" | "differentEmail" | "taken"; email?: undefined };

// החלק של חיבור הגוגל שכותב למסד. בקובץ נפרד מ-googleAuth.ts (שמאמת את הטוקן ברשת), כדי שטיפוסי ה-api לא יהיו מעגליים.
export const applyLink = internalMutation({
  args: { token: v.string(), sub: v.string(), email: v.string(), myPin: v.optional(v.string()) },
  handler: async (ctx, { token, sub, email, myPin }): Promise<LinkResult> => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent") throw new ConvexError("מייל רק להורים");
    // חשבון גוגל אחד לא מחובר לשני הורים.
    const sameSub = await ctx.db.query("people").filter((q) => q.eq(q.field("googleSub"), sub)).first();
    if (sameSub && sameSub._id !== me._id) return { ok: false as const, reason: "taken" as const };
    if (me.emailVerified && me.email) {
      // כבר יש מייל מאומת: גוגל מתחבר רק אם זו אותה כתובת. החלפת כתובת נעשית בנתיב ההחלפה הקיים.
      if (me.email !== email) return { ok: false as const, reason: "differentEmail" as const };
    } else {
      // חיבור מייל ראשון: כמו באימות בקוד, נדרש הקוד הסודי של ההורה, כדי שמי שמחזיק סשן פתוח לא יחבר חשבון משלו.
      if (!me.pinHash || !me.pinSalt || !myPin) return { ok: false as const, reason: "myPin" as const };
      if (me.lockedUntil && me.lockedUntil > Date.now()) return { ok: false as const, reason: "locked" as const };
      if (!(await verifyPin(myPin, me.pinSalt, me.pinHash))) {
        const r = await registerPinFail(ctx, me);
        if (r.locked) await ctx.scheduler.runAfter(0, internal.email.notifyLock, { personId: me._id });
        return { ok: false as const, reason: "myPin" as const };
      }
    }
    await ctx.db.patch(me._id, { email, emailVerified: true, pendingEmail: undefined, googleSub: sub });
    return { ok: true as const, email };
  },
});
