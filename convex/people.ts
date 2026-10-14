import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { MAX_FAMILY_SIZE, cleanName, hashPin, randomHex, requireParent, requireSameFamily, validPin } from "./lib";

export const add = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child"), v.literal("teen")),
    avatar: v.string(),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, { token, name, role, avatar, pin }) => {
    const me = await requireParent(ctx, token);
    const clean = cleanName(name);
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    if (members.some((p) => p.name === clean)) throw new ConvexError("כבר יש מישהו בשם הזה");
    if (pin !== undefined && !validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    const id = await ctx.db.insert("people", { familyId: me.familyId, name: clean, role, avatar: avatar.slice(0, 8) });
    if (pin) {
      const pinSalt = randomHex(16);
      await ctx.db.patch(id, { pinSalt, pinHash: await hashPin(pin, pinSalt) });
    }
    return id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("people") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    if (me._id === id) throw new ConvexError("אי אפשר להסיר את עצמך");
    await requireSameFamily(ctx, me, id);
    const asFrom = await ctx.db.query("entries").withIndex("by_from", (q) => q.eq("from", id)).first();
    const asTo = await ctx.db.query("entries").withIndex("by_to", (q) => q.eq("to", id)).first();
    if (asFrom || asTo) throw new ConvexError("יש רשומות על שמו/ה. מחקו אותן קודם");
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", id)).collect()) {
      await ctx.db.delete(s._id);
    }
    for (const s of await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", id)).collect()) {
      await ctx.db.delete(s._id);
    }
    await purgeFriends(ctx, id);
    const rec = await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    for (const r of rec) if (r.from === id || r.to === id) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});

// הורה משנה בין ילד/ה לנער/ה. מי שחוזר להיות ילד/ה מאבד/ת את מצב החברים.
export const setRole = mutation({
  args: { token: v.string(), id: v.id("people"), role: v.union(v.literal("child"), v.literal("teen")) },
  handler: async (ctx, { token, id, role }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, id);
    if (p.role === "parent") throw new ConvexError("אי אפשר לשנות תפקיד של הורה");
    if (p.role === role) return;
    await ctx.db.patch(id, role === "child"
      ? { role, friendsEnabled: false, friendsRequested: false, friendEmail: undefined }
      : { role });
  },
});
