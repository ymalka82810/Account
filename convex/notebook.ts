import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { requireParent, requirePerson, requireSameFamily } from "./lib";

// הפנקס האישי נשמר במכשיר של הילד/ה. ילד/ה שאישר/ה בהצטרפות שההורים יראו אותו משלח/ת עותק
// אחרי כל שינוי (sync), והורים קוראים אותו לצפייה בלבד (forChild). אין כאן שום כתיבה של הורה.
const MAX_BYTES = 400_000;

// מוחק את העותק של אדם (יציאה מהמשפחה, שינוי תפקיד, מחיקת קופה).
export async function purgeNotebook(ctx: MutationCtx, personId: Id<"people">) {
  for (const n of await ctx.db.query("notebooks").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
    await ctx.db.delete(n._id);
  }
}

export const sync = mutation({
  args: { token: v.string(), data: v.string() },
  handler: async (ctx, { token, data }) => {
    const me = await requirePerson(ctx, token);
    // רק ילד/ה שאישר/ה. מי שלא אישר/ה (או שהפך לנער/ה או להורה) לא משלח/ת כלום.
    if (me.role !== "child" || !me.notebookShared) return { shared: false as const };
    if (data.length > MAX_BYTES) throw new ConvexError("הפנקס גדול מדי לשיתוף");
    try {
      const d = JSON.parse(data);
      if (!d || !Array.isArray(d.entries)) throw new Error();
    } catch {
      throw new ConvexError("הפנקס לא תקין");
    }
    const existing = await ctx.db.query("notebooks").withIndex("by_person", (q) => q.eq("personId", me._id)).first();
    if (existing) await ctx.db.patch(existing._id, { data, updatedAt: Date.now() });
    else await ctx.db.insert("notebooks", { personId: me._id, familyId: me.familyId, data, updatedAt: Date.now() });
    return { shared: true as const };
  },
});

// הפנקס של ילד/ה במשפחה של ההורה, לצפייה בלבד. null = אין מה להראות (לא אושר, או עוד לא נשלח).
export const forChild = query({
  args: { token: v.string(), personId: v.id("people") },
  handler: async (ctx, { token, personId }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, personId);
    if (p.role !== "child" || !p.notebookShared) return null;
    const n = await ctx.db.query("notebooks").withIndex("by_person", (q) => q.eq("personId", personId)).first();
    if (!n) return null;
    try {
      const d = JSON.parse(n.data);
      return {
        updatedAt: n.updatedAt,
        currency: typeof d.currency === "string" ? d.currency : "",
        entries: (d.entries as any[]).slice(0, 2000).map((e) => ({
          id: String(e.id ?? ""), dir: e.dir === "owed" ? ("owed" as const) : ("iowe" as const),
          name: String(e.name ?? "").slice(0, 40), amount: Number(e.amount) || 0,
          note: String(e.note ?? "").slice(0, 200), date: String(e.date ?? "").slice(0, 10), paid: !!e.paid,
        })),
      };
    } catch {
      return null;
    }
  },
});
