import { query } from "./_generated/server";
import { v } from "convex/values";
import { getSessionPerson } from "./lib";

// כל נתוני המשפחה למי שמחובר/ת. בלי כניסה תקינה מחזיר null.
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me) return null;
    const people = await ctx.db.query("people").collect();
    let entries = await ctx.db.query("entries").collect();
    // ילדים רואים רק רשומות שקשורות אליהם. הורים רואים הכול.
    if (me.role !== "parent") entries = entries.filter((e) => e.from === me._id || e.to === me._id);
    return {
      me: { id: me._id, name: me.name, role: me.role, avatar: me.avatar ?? "🙂" },
      people: people.map((p) => ({
        id: p._id, name: p.name, role: p.role, avatar: p.avatar ?? "🙂", hasPin: !!p.pinHash,
      })),
      entries: entries.map((e) => ({
        id: e._id, kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note,
        date: e.date, createdBy: e.createdBy ?? null, createdAt: e.createdAt ?? e._creationTime,
      })),
    };
  },
});
