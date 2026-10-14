import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { addDays, jerusalemToday } from "./lib";
import { notify, shekel } from "./notify";

const STALE_DAYS = 14;

// פעם בשבוע: מוצא משפחות שיש בהן מכשירים רשומים ובודק כל אחת בנפרד.
export const weekly = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const subs = await ctx.db.query("pushSubs").take(4000);
    const familyIds = Array.from(new Set(subs.map((s) => s.familyId)));
    for (const familyId of familyIds) {
      await ctx.scheduler.runAfter(0, internal.reminders.forFamily, { familyId });
    }
  },
});

// תזכורת להורים על חובות פתוחים שלא זזו כבר שבועיים או יותר.
export const forFamily = internalMutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }): Promise<void> => {
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    const name = new Map(people.map((p) => [p._id, p.name]));
    const entries = (await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect())
      .filter((e) => e.status !== "pending");

    type Pair = { net: number; last: string; debtor: Id<"people">; creditor: Id<"people"> };
    const pairs = new Map<string, { a: Id<"people">; b: Id<"people">; net: number; last: string }>();
    for (const e of entries) {
      const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
      const key = `${a}:${b}`;
      const p = pairs.get(key) ?? { a, b, net: 0, last: "" };
      const sign = e.kind === "debt" ? 1 : -1;
      p.net += e.from === a ? sign * e.amount : -sign * e.amount; // כמה a חייב ל-b
      if (e.date > p.last) p.last = e.date;
      pairs.set(key, p);
    }

    const limit = addDays(jerusalemToday(), -STALE_DAYS);
    const stale: Pair[] = [];
    for (const p of pairs.values()) {
      if (p.net === 0 || p.last > limit) continue;
      stale.push(p.net > 0
        ? { net: p.net, last: p.last, debtor: p.a, creditor: p.b }
        : { net: -p.net, last: p.last, debtor: p.b, creditor: p.a });
    }
    if (!stale.length) return;

    const parents = people.filter((p) => p.role === "parent").map((p) => p._id);
    const body = stale.length === 1
      ? `${name.get(stale[0].debtor)} עדיין חייב/ת ל${name.get(stale[0].creditor)} ${shekel(stale[0].net)}`
      : `יש ${stale.length} חובות פתוחים שלא זזו כבר שבועיים, בסך ${shekel(stale.reduce((s, p) => s + p.net, 0))}`;
    await notify(ctx, parents, "תזכורת: חוב פתוח ⏰", body);
  },
});
