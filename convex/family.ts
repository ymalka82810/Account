import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { proofValidator, purgeBiometric, requireBiometric } from "./biometric";
import { cleanFamilyName, freshCode, requireParent } from "./lib";
import { COUNTRIES, isCurrency } from "./currency";

export const rename = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const me = await requireParent(ctx, token);
    await ctx.db.patch(me.familyId, { name: cleanFamilyName(name) });
  },
});

// מדינת המגורים והמטבע הראשי של המשפחה. בחירת מדינה מציעה את המטבע שלה, אבל אפשר לבחור מטבע אחר.
// רשומות קיימות נשארות במטבע שבו נרשמו, ומוצגות במטבע הראשי לפי השער הנוכחי.
export const setLocale = mutation({
  args: { token: v.string(), country: v.optional(v.string()), currency: v.string() },
  handler: async (ctx, { token, country, currency }) => {
    const me = await requireParent(ctx, token);
    if (!isCurrency(currency)) throw new ConvexError("מטבע לא נתמך");
    if (country !== undefined && country !== "" && !(country in COUNTRIES)) throw new ConvexError("מדינה לא נתמכת");
    await ctx.db.patch(me.familyId, { currency, country: country || undefined });
  },
});

// חשיפת קוד ההצטרפות: הורה בלבד, ורק אחרי אישור בטביעת אצבע / זיהוי פנים.
// הקוד לא נשלח יותר עם נתוני המשפחה (data:get), כך שאי אפשר לראות אותו בלי האישור הזה.
export const revealCode = mutation({
  args: { token: v.string(), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, proof }) => {
    const me = await requireParent(ctx, token);
    await requireBiometric(ctx, me, "reveal-code", proof);
    const family = await ctx.db.get(me.familyId);
    if (!family) throw new ConvexError("המשפחה לא נמצאה");
    return { code: family.childCode };
  },
});

// החלפת קוד ההצטרפות (למשל אם הוא הגיע למי שלא צריך). מי שכבר בפנים נשאר בפנים.
// מחזיר את הקוד החדש רק כדי לעדכן את הכניסה השמורה במכשיר; התצוגה נשארת מוסתרת.
export const rotateCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token);
    const childCode = await freshCode(ctx);
    await ctx.db.patch(me.familyId, { childCode, parentCode: undefined });
    return { loginCode: childCode };
  },
});

// מחיקת הקופה כולה: אנשים, רשומות וכניסות. אי אפשר לבטל.
export const remove = mutation({
  args: { token: v.string(), confirmName: v.string() },
  handler: async (ctx, { token, confirmName }) => {
    const me = await requireParent(ctx, token);
    const family = await ctx.db.get(me.familyId);
    if (!family) return;
    if (confirmName.trim() !== family.name) throw new ConvexError("שם המשפחה לא תואם");
    const familyId = me.familyId;
    for (const e of await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
      await ctx.db.delete(e._id);
    }
    for (const r of await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
      await ctx.db.delete(r._id);
    }
    for (const p of await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
      for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
        await ctx.db.delete(s._id);
      }
      for (const s of await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
        await ctx.db.delete(s._id);
      }
      await purgeFriends(ctx, p._id);
      await purgeBiometric(ctx, p._id);
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(familyId);
  },
});
