import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { MAX_AMOUNT, requirePerson } from "./lib";

const UNDO_MS = 10 * 60 * 1000;

export const add = mutation({
  args: {
    token: v.string(),
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(),
    note: v.string(),
    date: v.string(),
  },
  handler: async (ctx, { token, ...e }) => {
    const me = await requirePerson(ctx, token);
    // ילדים רושמים רק דברים שקשורים אליהם. הורים יכולים לרשום לכולם.
    if (me.role !== "parent" && e.from !== me._id && e.to !== me._id) {
      throw new ConvexError("אפשר לרשום רק חובות שקשורים אליך");
    }
    if (e.from === e.to) throw new ConvexError("אדם לא יכול להיות חייב לעצמו");
    if (!Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX_AMOUNT) throw new ConvexError("סכום לא תקין");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ConvexError("תאריך לא תקין");
    const note = e.note.trim();
    if (note.length > 80) throw new ConvexError("ההערה ארוכה מדי");
    // שני האנשים חייבים להיות באותה משפחה כמו המחובר/ת.
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    if (!from || !to || from.familyId !== me.familyId || to.familyId !== me.familyId) throw new ConvexError("אדם לא קיים");
    return await ctx.db.insert("entries", { ...e, note, familyId: me.familyId, createdBy: me._id, createdAt: Date.now() });
  },
});

// הורים מוחקים כל רשומה. מי שיצר/ה רשומה יכול/ה לבטל אותה רק ב-10 הדקות הראשונות.
export const remove = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requirePerson(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId) return;
    const mine = e.createdBy === me._id && Date.now() - (e.createdAt ?? 0) < UNDO_MS;
    if (me.role !== "parent" && !mine) throw new ConvexError("אפשר לבטל רק ב-10 הדקות הראשונות, או לבקש מהורה");
    await ctx.db.delete(id);
  },
});
