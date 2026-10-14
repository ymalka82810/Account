import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MAX_AMOUNT, MAX_FAMILY_SIZE, cleanName, requireParent } from "./lib";

// ייבוא נתונים מהמכשיר הישן / מקובץ גיבוי. מוסיף בלבד, לא מוחק כלום.
// אנשים חדשים נוצרים בלי קוד, וכל אחד יבחר קוד בכניסה הראשונה.
export const importData = mutation({
  args: {
    token: v.string(),
    people: v.array(v.object({
      id: v.string(),
      name: v.string(),
      role: v.union(v.literal("parent"), v.literal("child")),
    })),
    entries: v.array(v.object({
      kind: v.union(v.literal("debt"), v.literal("payment")),
      from: v.string(),
      to: v.string(),
      amount: v.number(),
      note: v.optional(v.string()),
      date: v.string(),
    })),
  },
  handler: async (ctx, { token, people, entries }) => {
    const me = await requireParent(ctx, token);
    if (people.length > 50 || entries.length > 5000) throw new ConvexError("הקובץ גדול מדי");

    const existing = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    const idMap = new Map<string, Id<"people">>();
    for (const p of people) {
      const name = cleanName(p.name);
      const found = existing.find((x) => x.name === name);
      if (found) { idMap.set(p.id, found._id); continue; }
      if (existing.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
      const id = await ctx.db.insert("people", {
        familyId: me.familyId, name, role: p.role, avatar: p.role === "parent" ? undefined : "🧒",
      });
      existing.push((await ctx.db.get(id))!);
      idMap.set(p.id, id);
    }

    let added = 0;
    for (const e of entries) {
      const from = idMap.get(e.from);
      const to = idMap.get(e.to);
      if (!from || !to || from === to) continue;
      if (!Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX_AMOUNT) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
      await ctx.db.insert("entries", {
        familyId: me.familyId, kind: e.kind, from, to, amount: e.amount, note: (e.note ?? "").slice(0, 80),
        date: e.date, createdBy: me._id, createdAt: Date.now(),
      });
      added++;
    }
    return { added };
  },
});
