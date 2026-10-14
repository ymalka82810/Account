import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { cleanName, hashPin, randomHex, requireParent, validPin } from "./lib";

export const add = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child")),
    avatar: v.string(),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, { token, name, role, avatar, pin }) => {
    await requireParent(ctx, token);
    const clean = cleanName(name);
    if ((await ctx.db.query("people").collect()).some((p) => p.name === clean)) {
      throw new ConvexError("כבר יש מישהו בשם הזה");
    }
    if (pin !== undefined && !validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    const id = await ctx.db.insert("people", { name: clean, role, avatar: avatar.slice(0, 8) });
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
    const asFrom = await ctx.db.query("entries").withIndex("by_from", (q) => q.eq("from", id)).first();
    const asTo = await ctx.db.query("entries").withIndex("by_to", (q) => q.eq("to", id)).first();
    if (asFrom || asTo) throw new ConvexError("יש רשומות על שמו/ה. מחקו אותן קודם");
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", id)).collect()) {
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(id);
  },
});
