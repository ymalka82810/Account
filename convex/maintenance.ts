import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH = 500;
// כל חלונות ההגבלה קצרים מזה, אז רשומה ישנה יותר מיממה כבר לא משפיעה על כלום.
const THROTTLE_KEEP_MS = 24 * 60 * 60 * 1000;

// מוחק כניסות שפג תוקפן ומוני הגבלת קצב ישנים. רץ פעם ביום (crons.ts).
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

    if (sessions.length === BATCH || throttles.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.maintenance.cleanup, {});
    }
  },
});
