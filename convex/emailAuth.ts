import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { hashToken, normalizeEmail, requirePerson, validEmail, validPin, pinRuleMessage, findFamilyByCode } from "./lib";
import { issueCode, verifyCode } from "./emailCodes";
import { codeThrottled, failCode, openSession, setPin } from "./auth";

// ---------- חיבור מייל להורה ----------
// הורה שכבר יש לו מייל מאומת צריך קודם קוד מהמייל הישן (requestEmailChangeCode),
// כדי שמי שמחזיק סשן פתוח לא יוכל להחליף את המייל לכתובת משלו.
export const requestEmailChangeCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent" || !me.emailVerified || !me.email) throw new ConvexError("אין מייל מאומת להחלפה");
    await issueCode(ctx, me, me.email, "emailChange");
    return { ok: true as const };
  },
});

export const requestVerify = mutation({
  args: { token: v.string(), email: v.string(), oldCode: v.optional(v.string()) },
  handler: async (ctx, { token, email, oldCode }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent") throw new ConvexError("מייל רק להורים");
    const clean = normalizeEmail(email);
    if (!validEmail(clean)) throw new ConvexError("כתובת מייל לא תקינה");
    if (me.emailVerified) {
      if (!oldCode || !(await verifyCode(ctx, me._id, "emailChange", oldCode))) {
        return { ok: false as const, reason: "oldCode" as const };
      }
    }
    await ctx.db.patch(me._id, { pendingEmail: clean });
    await issueCode(ctx, me, clean, "verify");
    return { ok: true as const };
  },
});

export const confirmEmail = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent" || !me.pendingEmail) return { ok: false as const, reason: "code" as const };
    const row = await verifyCode(ctx, me._id, "verify", code);
    if (!row || row.email !== me.pendingEmail) return { ok: false as const, reason: "code" as const };
    await ctx.db.patch(me._id, { email: row.email, emailVerified: true, pendingEmail: undefined });
    return { ok: true as const };
  },
});

// ---------- שינוי קוד סודי (מחובר/ת) באישור מייל ----------
export const requestChangeCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePerson(ctx, token);
    if (!me.emailVerified || !me.email) throw new ConvexError("אין מייל מאומת");
    await issueCode(ctx, me, me.email, "pinChange");
    return { ok: true as const };
  },
});

export const changePinWithCode = mutation({
  args: { token: v.string(), code: v.string(), newPin: v.string() },
  handler: async (ctx, { token, code, newPin }) => {
    const me = await requirePerson(ctx, token);
    if (!validPin(newPin, me.role)) throw new ConvexError(pinRuleMessage(me.role));
    if (!(await verifyCode(ctx, me._id, "pinChange", code))) return { ok: false as const, reason: "code" as const };
    await setPin(ctx, me._id, newPin);
    // מנתקים מכשירים אחרים, משאירים את הנוכחי.
    const current = await hashToken(token);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", me._id)).collect()) {
      if (s.tokenHash !== current) await ctx.db.delete(s._id);
    }
    return { ok: true as const };
  },
});

// ---------- שכחתי קוד (הורה, לפני כניסה) ----------
// תמיד מחזיר ok כשהקוד של המשפחה נכון, כדי לא לחשוף למי יש מייל.
export const requestResetCode = mutation({
  args: { code: v.string(), personId: v.id("people"), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, device }) => {
    if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    const p = await ctx.db.get(personId);
    if (!found || !p || p.familyId !== found.family._id) return await failCode(ctx, device);
    if (p.role === "parent" && p.emailVerified && p.email) await issueCode(ctx, p, p.email, "pinReset");
    return { ok: true as const };
  },
});

export const resetWithCode = mutation({
  args: {
    code: v.string(), personId: v.id("people"), emailCode: v.string(), newPin: v.string(), device: v.optional(v.string()),
  },
  handler: async (ctx, { code, personId, emailCode, newPin, device }) => {
    if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    const p = await ctx.db.get(personId);
    if (!found || !p || p.familyId !== found.family._id) return await failCode(ctx, device);
    if (!validPin(newPin, p.role)) throw new ConvexError(pinRuleMessage(p.role));
    if (p.role !== "parent" || !(await verifyCode(ctx, p._id, "pinReset", emailCode))) {
      return { ok: false as const, reason: "emailCode" as const };
    }
    await setPin(ctx, p._id, newPin);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
      await ctx.db.delete(s._id);
    }
    return { ok: true as const, token: await openSession(ctx, p._id) };
  },
});

// ---------- הורה מאשר קוד חדש לילד/ה ----------
export const requestChildResetCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent" || !me.emailVerified || !me.email) throw new ConvexError("אין מייל מאומת");
    await issueCode(ctx, me, me.email, "childReset");
    return { ok: true as const };
  },
});
