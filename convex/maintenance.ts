import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ACTIVITY_KEEP_MS } from "./activity";

const BATCH = 500;
// כל חלונות ההגבלה קצרים מזה, אז רשומה ישנה יותר מיממה כבר לא משפיעה על כלום.
const THROTTLE_KEEP_MS = 24 * 60 * 60 * 1000;
// תוצאת בקשת הצטרפות (אושרה/נדחתה) נשמרת שבוע, כדי שמי שביקש/ה יראה מה קרה גם אם חזר/ה אחרי כמה ימים.
const JOIN_OUTCOME_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

// מוחק כניסות וקודי אימות שפג תוקפם ומוני הגבלת קצב ישנים. רץ פעם ביום (crons.ts).
// אם יש יותר מ-BATCH רשומות, מתזמן את עצמו שוב כדי לא לחרוג ממגבלות הפעולה.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const s of sessions) await ctx.db.delete(s._id);

    const throttles = await ctx.db
      .query("throttles")
      .withIndex("by_window", (q) => q.lt("windowStart", now - THROTTLE_KEEP_MS))
      .take(BATCH);
    for (const t of throttles) await ctx.db.delete(t._id);

    const codes = await ctx.db
      .query("emailCodes")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const c of codes) await ctx.db.delete(c._id);

    // gt(0) משאיר בחוץ כרטיסים ישנים בלי expiresAt (ב-Convex undefined קטן מכל מספר).
    const passes = await ctx.db
      .query("devicePasses")
      .withIndex("by_expires", (q) => q.gt("expiresAt", 0).lt("expiresAt", now))
      .take(BATCH);
    for (const p of passes) await ctx.db.delete(p._id);

    const oldActivity = await ctx.db
      .query("activity")
      .withIndex("by_at", (q) => q.lt("at", now - ACTIVITY_KEEP_MS))
      .take(BATCH);
    for (const a of oldActivity) await ctx.db.delete(a._id);

    const oldOutcomes = await ctx.db
      .query("joinOutcomes")
      .withIndex("by_at", (q) => q.lt("at", now - JOIN_OUTCOME_KEEP_MS))
      .take(BATCH);
    for (const o of oldOutcomes) await ctx.db.delete(o._id);

    if (oldActivity.length === BATCH || sessions.length === BATCH || throttles.length === BATCH || codes.length === BATCH || passes.length === BATCH || oldOutcomes.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.maintenance.cleanup, {});
    }
  },
});

// חד-פעמי, לפני שברירת המחדל של מטבע חסר עברה משקלים לדולר: כל מסמך בלי מטבע היה שקלים,
// אז כותבים לו ILS במפורש כדי שהמשמעות שלו לא תשתנה. משפחה בלי מדינה ובלי מטבע הייתה גם "ישראל".
export const fillLegacyCurrency = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const f of await ctx.db.query("families").collect()) {
      if (f.currency) continue;
      await ctx.db.patch(f._id, { currency: "ILS", ...(f.country ? {} : { country: "IL" }) });
      counts.families = (counts.families ?? 0) + 1;
    }
    for (const table of ["entries", "recurring", "goals", "activity", "friendEntries"] as const) {
      for (const d of await ctx.db.query(table).collect()) {
        if (d.currency) continue;
        await ctx.db.patch(d._id, { currency: "ILS" });
        counts[table] = (counts[table] ?? 0) + 1;
      }
    }
    return counts;
  },
});
