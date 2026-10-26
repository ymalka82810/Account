import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getSessionPerson } from "./lib";

// ההיסטוריה המלאה בדפים, מהחדש לישן. all (להורים בלבד) = כל המשפחה, אחרת רק מה שקשור אליי.
// ילדים רואים רק רשומות שקשורות אליהם; רשומה שממתינה לאישור רק למי שיצר/ה אותה ולהורים.
export const page = query({
  args: { token: v.string(), all: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { token, all, paginationOpts }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me || !me.familyId) return { page: [], isDone: true, continueCursor: "" };
    const familyId = me.familyId;
    const isParent = me.role === "parent";
    const base = ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).order("desc");
    const res = await (isParent && all
      ? base
      : base.filter((f) => {
          const mine = f.or(f.eq(f.field("from"), me._id), f.eq(f.field("to"), me._id));
          return isParent
            ? mine
            : f.and(mine, f.or(f.neq(f.field("status"), "pending"), f.eq(f.field("createdBy"), me._id)));
        })
    ).paginate(paginationOpts);

    return {
      ...res,
      page: await Promise.all(res.page.map(async (e) => ({
        id: e._id, kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note,
        currency: e.currency ?? "ILS", fx: e.fx ?? null,
        date: e.date, createdBy: e.createdBy ?? null, createdAt: e.createdAt ?? e._creationTime,
        status: e.status ?? "approved",
        debtId: e.debtId ?? null,
        archived: !!e.archived,
        // בהחזר מקושר: שם החוב שהוא שילם (לתצוגה בהיסטוריה, גם כשהחוב כבר לא נשלח עם הנתונים הראשיים).
        debtNote: e.debtId ? ((await ctx.db.get(e.debtId))?.note ?? null) : null,
      }))),
    };
  },
});
