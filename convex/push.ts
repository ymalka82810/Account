import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requirePerson } from "./lib";

const MAX_DEVICES_PER_PERSON = 10;

// רישום המכשיר הזה להתראות. אם המכשיר כבר רשום (גם על שם אדם אחר) הוא עובר לאדם המחובר עכשיו.
export const subscribe = mutation({
  args: { token: v.string(), endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, { token, endpoint, p256dh, auth }) => {
    const me = await requirePerson(ctx, token);
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) {
      throw new ConvexError("מנוי התראות לא תקין");
    }
    for (const s of await ctx.db.query("pushSubs").withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).collect()) {
      await ctx.db.delete(s._id);
    }
    const mine = await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", me._id)).collect();
    if (mine.length >= MAX_DEVICES_PER_PERSON) {
      const oldest = [...mine].sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("pushSubs", { personId: me._id, familyId: me.familyId, endpoint, p256dh, auth, createdAt: Date.now() });
  },
});

export const unsubscribe = mutation({
  args: { token: v.string(), endpoint: v.string() },
  handler: async (ctx, { token, endpoint }) => {
    const me = await requirePerson(ctx, token);
    for (const s of await ctx.db.query("pushSubs").withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).collect()) {
      if (s.personId === me._id) await ctx.db.delete(s._id);
    }
  },
});

export const forPeople = internalQuery({
  args: { personIds: v.array(v.id("people")) },
  handler: async (ctx, { personIds }) => {
    const out = [];
    for (const id of personIds) {
      out.push(...(await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", id)).collect()));
    }
    return out;
  },
});

export const removeDead = internalMutation({
  args: { ids: v.array(v.id("pushSubs")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id);
  },
});
