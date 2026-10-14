import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { cleanFamilyName, freshCode, requireParent } from "./lib";

export const rename = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const me = await requireParent(ctx, token);
    await ctx.db.patch(me.familyId, { name: cleanFamilyName(name) });
  },
});

// החלפת קוד הצטרפות (למשל אם הוא הגיע למי שלא צריך). מי שכבר בפנים נשאר בפנים.
export const rotateCode = mutation({
  args: { token: v.string(), which: v.union(v.literal("parent"), v.literal("child")) },
  handler: async (ctx, { token, which }) => {
    const me = await requireParent(ctx, token);
    const code = await freshCode(ctx);
    await ctx.db.patch(me.familyId, which === "parent" ? { parentCode: code } : { childCode: code });
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
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(familyId);
  },
});
