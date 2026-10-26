import { internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { Rates, convert, curOf } from "./currency";
import { loadRates } from "./fx";

// ארכוב: כשכל החובות של כיוון מסוים (from → to) שולמו ואין החזר עודף, כל הרשומות המאושרות של
// הכיוון הזה מסומנות archived. הן כבר לא משפיעות על שום יתרה (חוב סגור מדלג עליו כל החזר חדש),
// ולכן data.get לא שולח אותן והלקוח מחשב יתרות רק על מה שפעיל. היסטוריה מלאה: history.page.
// אם מוחקים רשומה מכוונת מאורכבת, מחזירים את כולן לפעילות (unarchivePair) כדי שהחישוב ייצא כמו על הכול.

const EPS = 0.5; // כמו בלקוח (computations.js): פחות מחצי אגורה = שולם

// תקרה מפורשת לרשומות פעילות בכיוון אחד (from → to). היא חוסמת את כל הקריאות שגדלות עם הזמן:
// data:get (סכום התקרות של הזוגות במשפחה), entries.add ו-isSettled. חוב חדש נחסם כבר ב-MAX_PAIR_DEBTS
// כדי שיישאר מקום להחזרים שסוגרים אותם. מעבר ל-MAX_PAIR_ACTIVE נחסם גם החזר.
export const MAX_PAIR_DEBTS = 300;
export const MAX_PAIR_ACTIVE = 400;
type Entry = Doc<"entries">;

const order = (a: Entry, b: Entry) =>
  a.date.localeCompare(b.date) || (a.createdAt ?? a._creationTime) - (b.createdAt ?? b._creationTime);

// האם הרשומות (מאושרות, כיוון אחד) סגורות לגמרי. אותה חלוקת החזרים כמו ledger() בלקוח:
// קודם החזרים מקושרים, ואז החזרים כלליים מהישן לחדש. בספק (חסר שער, חוב חסר) מחזיר false.
export function isSettled(entries: Entry[], rates: Rates | null): boolean {
  const debts = entries.filter((e) => e.kind === "debt").sort(order);
  const state = new Map<Id<"entries">, { cur: string; remaining: number }>();
  for (const d of debts) state.set(d._id, { cur: curOf(d), remaining: d.amount });
  const pays = entries.filter((e) => e.kind === "payment").sort(order);

  for (const e of pays) {
    if (!e.debtId) continue;
    const st = state.get(e.debtId);
    if (!st) return false;
    const r = convert(1, st.cur, curOf(e), e.fx ?? rates);
    if (r === null) return false;
    const used = Math.min(st.remaining, e.amount / r);
    st.remaining -= used;
    if (st.remaining < EPS) st.remaining = 0;
    if (e.amount - used * r >= 1) return false; // החזר עודף
  }
  for (const e of pays) {
    if (e.debtId) continue;
    let left = e.amount;
    for (const d of debts) {
      if (left < EPS) break;
      const st = state.get(d._id)!;
      if (st.remaining <= 0) continue;
      const r = convert(1, st.cur, curOf(e), e.fx ?? rates);
      if (r === null) continue;
      const take = Math.min(left, st.remaining * r);
      st.remaining -= take / r;
      left -= take;
      if (st.remaining < EPS) st.remaining = 0;
    }
    if (left >= 1) return false;
  }
  for (const st of state.values()) if (st.remaining > 0) return false;
  return true;
}

// מארכב את הכיוון from → to אם הוא סגור. רשומות שממתינות לאישור נשארות פעילות.
export async function archivePair(ctx: MutationCtx, from: Id<"people">, to: Id<"people">, rates: Rates | null): Promise<void> {
  // הוספה נחסמת ב-MAX_PAIR_ACTIVE, אז יותר מזה בא רק מנתונים ישנים: לא מארכבים על בסיס חלקי.
  const rows = await ctx.db.query("entries").withIndex("by_pair", (q) => q.eq("from", from).eq("to", to).eq("archived", undefined)).take(MAX_PAIR_ACTIVE + 1);
  if (rows.length > MAX_PAIR_ACTIVE) return;
  const approved = rows.filter((e) => e.status !== "pending");
  if (!approved.length || !isSettled(approved, rates)) return;
  for (const e of approved) await ctx.db.patch(e._id, { archived: true });
}

export async function unarchivePair(ctx: MutationCtx, from: Id<"people">, to: Id<"people">): Promise<void> {
  const rows = await ctx.db.query("entries").withIndex("by_pair", (q) => q.eq("from", from).eq("to", to).eq("archived", true)).collect();
  for (const e of rows) await ctx.db.patch(e._id, { archived: undefined });
}

// הרצה חד-פעמית על נתונים קיימים: npx convex run ledger:backfill
// עוברת על הרשומות בקבוצות ומתזמנת את עצמה עד הסוף. בטוח להריץ שוב.
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const rates = (await loadRates(ctx))?.rates ?? null;
    const res = await ctx.db.query("entries").paginate({ numItems: 100, cursor: cursor ?? null });
    const seen = new Set<string>();
    for (const e of res.page) {
      if (e.archived) continue;
      const key = `${e.from}:${e.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await archivePair(ctx, e.from, e.to, rates);
    }
    if (!res.isDone) await ctx.scheduler.runAfter(0, internal.ledger.backfill, { cursor: res.continueCursor });
  },
});
