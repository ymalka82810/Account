import { logActivity } from "./activity";
import { internalMutation, mutation } from "./_generated/server";
import { purgeGoals } from "./goals";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { purgeNotebook } from "./notebook";
import { proofValidator, purgeBiometric, requireBiometric } from "./biometric";
import { cleanFamilyName, freshCode, issuePass, purgeAuthRows, purgePasses, requireParent } from "./lib";
import { COUNTRIES, isCurrency } from "./currency";

const PURGE_BATCH = 500;

export const rename = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const me = await requireParent(ctx, token);
    const clean = cleanFamilyName(name);
    await ctx.db.patch(me.familyId, { name: clean });
    await logActivity(ctx, me, "family_rename", { subject: clean });
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
    await logActivity(ctx, me, "locale_set", { subject: currency });
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
// כל כרטיסי הכניסה של המכשירים נמחקים (אולי מישהו זר שמר את המשפחה עם הקוד הישן).
// keepDevice: המכשיר של ההורה שמחליף שומר את המשפחה, אז הוא מקבל כרטיס חדש.
export const rotateCode = mutation({
  args: { token: v.string(), keepDevice: v.optional(v.boolean()), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, keepDevice, proof }) => {
    const me = await requireParent(ctx, token);
    // החלפת הקוד מנתקת את כל המכשירים ששמרו את המשפחה, ולכן דורשת אישור (ביומטרי, או קוד סודי כשאין ביומטריה).
    await requireBiometric(ctx, me, "family-rotate", proof);
    await ctx.db.patch(me.familyId, { childCode: await freshCode(ctx), parentCode: undefined });
    await purgePasses(ctx, me.familyId);
    await logActivity(ctx, me, "code_rotated");
    return { loginCode: keepDevice ? await issuePass(ctx, me.familyId) : undefined };
  },
});

// מחיקת הקופה כולה: אנשים, רשומות וכניסות. אי אפשר לבטל.
export const remove = mutation({
  args: { token: v.string(), confirmName: v.string(), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, confirmName, proof }) => {
    const me = await requireParent(ctx, token);
    const family = await ctx.db.get(me.familyId);
    if (!family) return;
    if (confirmName.trim() !== family.name) throw new ConvexError("שם המשפחה לא תואם");
    // פעולה שאי אפשר לבטל: שם המשפחה לא מספיק למי שרק מחזיק סשן פתוח.
    await requireBiometric(ctx, me, "family-remove", proof);
    const familyId = me.familyId;
    for (const r of await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
      await ctx.db.delete(r._id);
    }
    await purgeGoals(ctx, familyId);
    for (const j of await ctx.db.query("joinRequests").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
      await ctx.db.delete(j._id);
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
      await purgeAuthRows(ctx, p._id);
      await purgeNotebook(ctx, p._id);
      await ctx.db.delete(p._id);
    }
    await purgePasses(ctx, familyId);
    await ctx.db.delete(familyId);
    // הרשומות נמחקות בקבוצות, כדי שהרבה היסטוריה לא תחרוג ממגבלת הכתיבות של טרנזקציה אחת.
    await ctx.scheduler.runAfter(0, internal.family.purgeEntries, { familyId });
  },
});

export const purgeEntries = internalMutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }): Promise<void> => {
    const batch = await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).take(PURGE_BATCH);
    for (const e of batch) await ctx.db.delete(e._id);
    // יומן השינויים מכיל שמות וסכומים של המשפחה, ולכן נמחק איתה ולא ממתין לניקוי היומי.
    const log = await ctx.db.query("activity").withIndex("by_family_at", (q) => q.eq("familyId", familyId)).take(PURGE_BATCH);
    for (const a of log) await ctx.db.delete(a._id);
    if (batch.length === PURGE_BATCH || log.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.family.purgeEntries, { familyId });
  },
});
