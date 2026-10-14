import { query } from "./_generated/server";
import { v } from "convex/values";
import { getSessionPerson } from "./lib";

// כל נתוני המשפחה למי שמחובר/ת. בלי כניסה תקינה מחזיר null.
// אם החשבון הוא מהגרסה הישנה (בלי משפחה), מחזיר legacy כדי שהאפליקציה תעביר אותו.
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me) return null;
    if (!me.familyId) return { legacy: true as const, canMigrate: me.role === "parent" };
    const familyId = me.familyId;
    const family = await ctx.db.get(familyId);
    if (!family) return null;
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    let entries = await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    // ילדים רואים רק רשומות שקשורות אליהם. הורים רואים הכול.
    if (me.role !== "parent") entries = entries.filter((e) => e.from === me._id || e.to === me._id);
    return {
      legacy: false as const,
      me: { id: me._id, name: me.name, role: me.role, avatar: me.avatar ?? "🙂" },
      // קודי ההצטרפות מגיעים להורים בלבד.
      family: me.role === "parent"
        ? { name: family.name, parentCode: family.parentCode, childCode: family.childCode }
        : { name: family.name },
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
