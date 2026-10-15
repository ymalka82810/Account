import { internalMutation, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { MAX_AMOUNT, advanceDate, firstAfter, jerusalemToday, requireParent, requireSameFamily } from "./lib";
import { notify } from "./notify";
import { LEGACY_CURRENCY, fmtMoney } from "./currency";

const MAX_PER_FAMILY = 30;
const MAX_CATCH_UP = 8; // כמה רישומים מוחמצים משלימים בריצה אחת

export const add = mutation({
  args: {
    token: v.string(),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(),
    note: v.string(),
    frequency: v.union(v.literal("weekly"), v.literal("monthly")),
    weekday: v.optional(v.number()),
    monthDay: v.optional(v.number()),
  },
  handler: async (ctx, { token, ...r }) => {
    const me = await requireParent(ctx, token);
    if (r.from === r.to) throw new ConvexError("אדם לא יכול להיות חייב לעצמו");
    if (!Number.isInteger(r.amount) || r.amount <= 0 || r.amount > MAX_AMOUNT) throw new ConvexError("סכום לא תקין");
    const note = r.note.trim() || "דמי כיס";
    if (note.length > 80) throw new ConvexError("ההערה ארוכה מדי");
    if (r.frequency === "weekly" && !(Number.isInteger(r.weekday) && r.weekday! >= 0 && r.weekday! <= 6)) throw new ConvexError("יום לא תקין");
    if (r.frequency === "monthly" && !(Number.isInteger(r.monthDay) && r.monthDay! >= 1 && r.monthDay! <= 28)) throw new ConvexError("יום בחודש לא תקין (1 עד 28)");
    await requireSameFamily(ctx, me, r.from);
    await requireSameFamily(ctx, me, r.to);
    const family = await ctx.db.get(me.familyId);
    const existing = await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    if (existing.length >= MAX_PER_FAMILY) throw new ConvexError("יש כבר הרבה רישומים קבועים");
    return await ctx.db.insert("recurring", {
      familyId: me.familyId, from: r.from, to: r.to, amount: r.amount, note,
      currency: family?.currency ?? LEGACY_CURRENCY,
      frequency: r.frequency,
      weekday: r.frequency === "weekly" ? r.weekday : undefined,
      monthDay: r.frequency === "monthly" ? r.monthDay : undefined,
      nextDate: firstAfter(jerusalemToday(), r.frequency, r.weekday, r.monthDay),
      createdBy: me._id, createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("recurring") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const r = await ctx.db.get(id);
    if (!r || r.familyId !== me.familyId) return;
    await ctx.db.delete(id);
  },
});

// רץ פעם ביום (crons.ts). יוצר חוב לכל רישום קבוע שהגיע זמנו, ומשלים רישומים שהוחמצו.
export const runDue = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const today = jerusalemToday();
    const due = await ctx.db.query("recurring").withIndex("by_nextDate", (q) => q.lte("nextDate", today)).take(200);
    for (const r of due) {
      const from = await ctx.db.get(r.from);
      const to = await ctx.db.get(r.to);
      if (!from || !to || from.familyId !== r.familyId || to.familyId !== r.familyId) {
        await ctx.db.delete(r._id);
        continue;
      }
      let next = r.nextDate;
      let created = 0;
      while (next <= today && created < MAX_CATCH_UP) {
        await ctx.db.insert("entries", {
          familyId: r.familyId, kind: "debt", from: r.from, to: r.to, amount: r.amount,
          currency: r.currency ?? LEGACY_CURRENCY, note: r.note, date: next, createdBy: r.createdBy, createdAt: Date.now(),
        });
        next = advanceDate(next, r.frequency, r.monthDay);
        created++;
      }
      // אם הוחמצו הרבה פעמים, מדלגים קדימה ולא מציפים בחובות.
      while (next <= today) next = advanceDate(next, r.frequency, r.monthDay);
      await ctx.db.patch(r._id, { nextDate: next });
      if (created > 0) {
        await notify(ctx, [r.to], "נרשם חוב 🪙", `${r.note}: ${from.name} חייב/ת לך ${fmtMoney(r.amount * created, r.currency)}`);
      }
    }
  },
});
