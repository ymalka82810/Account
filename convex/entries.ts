import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { MAX_AMOUNT, requireParent, requirePerson } from "./lib";
import { entryLine, entryTextFor, notify } from "./notify";

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

    // מה שילד/ה רושם/ת ממתין לאישור הורה. מה שהורה רושם מאושר מיד.
    const pending = me.role !== "parent";
    const id = await ctx.db.insert("entries", {
      ...e, note, familyId: me.familyId, createdBy: me._id, createdAt: Date.now(),
      ...(pending ? { status: "pending" as const } : {}),
    });

    const names = { from: from.name, to: to.name, creator: me.name };
    if (pending) {
      const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
      const parents = members.filter((p) => p.role === "parent" && p._id !== me._id).map((p) => p._id);
      await notify(ctx, parents, "ממתין לאישור ⏳", `${me.name} רשם/ה: ${entryLine(e, names)}`);
    } else {
      for (const r of [e.from, e.to]) {
        if (r !== me._id) await notify(ctx, [r], "הקופה המשפחתית 🪙", entryTextFor(r, e, names));
      }
    }
    return id;
  },
});

// הורה מאשר רשומה שילד/ה רשם/ה. מרגע האישור היא נספרת ביתרות.
export const approve = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId || e.status !== "pending") return;
    await ctx.db.patch(id, { status: undefined });
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    const creator = e.createdBy ? await ctx.db.get(e.createdBy) : null;
    if (!from || !to) return;
    const names = { from: from.name, to: to.name, creator: creator?.name ?? "מישהו" };
    if (creator && creator._id !== me._id) {
      await notify(ctx, [creator._id], "אושר ✅", entryLine(e, names));
    }
    for (const r of [e.from, e.to]) {
      if (r !== me._id && r !== e.createdBy) await notify(ctx, [r], "הקופה המשפחתית 🪙", entryTextFor(r, e, names));
    }
  },
});

// הורה דוחה רשומה שממתינה לאישור. היא נמחקת, ומי שיצר/ה אותה מקבל/ת הודעה.
export const reject = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId || e.status !== "pending") return;
    await ctx.db.delete(id);
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    if (e.createdBy && e.createdBy !== me._id && from && to) {
      await notify(ctx, [e.createdBy], "לא אושר", entryLine(e, { from: from.name, to: to.name, creator: me.name }));
    }
  },
});

// הורים מוחקים כל רשומה. מי שיצר/ה רשומה יכול/ה לבטל אותה בכל שלב כל עוד היא ממתינה לאישור, או ב-10 הדקות הראשונות.
export const remove = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requirePerson(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId) return;
    const mine = e.createdBy === me._id && (e.status === "pending" || Date.now() - (e.createdAt ?? 0) < UNDO_MS);
    if (me.role !== "parent" && !mine) throw new ConvexError("אפשר לבטל רק ב-10 הדקות הראשונות, או לבקש מהורה");
    await ctx.db.delete(id);
  },
});
