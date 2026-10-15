import { action, internalAction, internalMutation, internalQuery, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { CURRENCIES, Rates } from "./currency";

// שערי חליפין: מסמך אחד בטבלה fxRates, מתעדכן מספק חינמי כל כמה שעות (crons.ts).
// בסיס: דולר (rates[X] = כמה X שווה דולר אחד).
const FRESH_MS = 3 * 60 * 60 * 1000;

export async function loadRates(ctx: QueryCtx | MutationCtx): Promise<{ rates: Rates; fetchedAt: number } | null> {
  const doc = await ctx.db.query("fxRates").first();
  return doc ? { rates: doc.rates, fetchedAt: doc.fetchedAt } : null;
}

// לאפליקציה: השערים העדכניים (רק המטבעות שהאפליקציה מכירה).
export const rates = query({
  args: {},
  handler: async (ctx) => loadRates(ctx),
});

export const latest = internalQuery({
  args: {},
  handler: async (ctx) => loadRates(ctx),
});

export const store = internalMutation({
  args: { rates: v.record(v.string(), v.number()), source: v.string() },
  handler: async (ctx, { rates, source }) => {
    const doc = await ctx.db.query("fxRates").first();
    const row = { rates, source, fetchedAt: Date.now() };
    if (doc) await ctx.db.patch(doc._id, row);
    else await ctx.db.insert("fxRates", row);
  },
});

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// שני ספקים חינמיים בלי מפתח. הראשון מכסה את כל המטבעות, השני (הבנק האירופי) גיבוי.
async function fetchRates(): Promise<{ rates: Rates; source: string }> {
  const pick = (all: Record<string, number>) => {
    const out: Rates = { USD: 1 };
    for (const c of CURRENCIES) if (typeof all[c] === "number" && all[c] > 0) out[c] = all[c];
    return out;
  };
  try {
    const j = await fetchJson("https://open.er-api.com/v6/latest/USD");
    if (j.result === "success" && j.rates) return { rates: pick(j.rates), source: "open.er-api.com" };
  } catch (e) { console.warn("fx primary failed", e); }
  const j = await fetchJson("https://api.frankfurter.app/latest?from=USD");
  return { rates: pick(j.rates ?? {}), source: "frankfurter.app" };
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const r = await fetchRates();
    if (Object.keys(r.rates).length < 3) throw new Error("fx: too few rates");
    await ctx.runMutation(internal.fx.store, r);
  },
});

// האפליקציה קוראת לזה כשאין שערים או שהם ישנים. מעדכן רק אם באמת צריך.
export const ensure = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    const cur = await ctx.runQuery(internal.fx.latest, {});
    if (cur && Date.now() - cur.fetchedAt < FRESH_MS) return;
    await ctx.runAction(internal.fx.refresh, {});
  },
});
