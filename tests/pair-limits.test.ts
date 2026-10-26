// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { archivePair, MAX_PAIR_ACTIVE, MAX_PAIR_DEBTS } from "../convex/ledger";
import { newDb, seedFamily, T } from "./helpers/seed";

const date = "2026-01-15";
let t: T;
let F: Awaited<ReturnType<typeof seedFamily>>;
const dad = () => F.tokens["אבא"];

beforeEach(async () => {
  t = newDb();
  F = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "גיל", role: "child" }]);
});

// מכניסים ישירות למסד (מהר יותר מ-add) רשומות פעילות לכיוון אבא → דנה.
const seed = (debts: number, payments: number) =>
  t.run(async (ctx) => {
    const base = { familyId: F.familyId, from: F.ids["אבא"], to: F.ids["דנה"], amount: 100, note: "", date, createdAt: Date.now() };
    for (let i = 0; i < debts; i++) await ctx.db.insert("entries", { ...base, kind: "debt" });
    for (let i = 0; i < payments; i++) await ctx.db.insert("entries", { ...base, kind: "payment" });
  });

const add = (kind: "debt" | "payment", to = "דנה") =>
  t.mutation(api.entries.add, { token: dad(), kind, from: F.ids["אבא"], to: F.ids[to], amount: 100, note: "", date });

describe("תקרת רשומות פעילות לכיוון", () => {
  it("חוב חדש נחסם כשיש כבר MAX_PAIR_DEBTS חובות פעילים", async () => {
    await seed(MAX_PAIR_DEBTS, 0);
    await expect(add("debt")).rejects.toThrow("יותר מדי חובות");
  });

  it("החזר עדיין מותר כשהחובות במקסימום", async () => {
    await seed(MAX_PAIR_DEBTS, 0);
    await expect(add("payment")).resolves.toBeDefined();
  });

  it("הכול נחסם, גם החזר, כשהזוג הגיע ל-MAX_PAIR_ACTIVE", async () => {
    await seed(MAX_PAIR_DEBTS, MAX_PAIR_ACTIVE - MAX_PAIR_DEBTS);
    await expect(add("payment")).rejects.toThrow("יותר מדי רישומים");
    await expect(add("debt")).rejects.toThrow("יותר מדי רישומים");
  });

  it("התקרה היא לכיוון: זוג אחר לא מושפע", async () => {
    await seed(MAX_PAIR_DEBTS, 0);
    await expect(add("debt", "גיל")).resolves.toBeDefined();
  });

  it("זוג שעבר את התקרה (נתונים ישנים) לא מאורכב גם אם הוא סגור", async () => {
    await seed(0, MAX_PAIR_ACTIVE); // 400 החזרים של 100
    await t.run((ctx) => ctx.db.insert("entries", {
      familyId: F.familyId, from: F.ids["אבא"], to: F.ids["דנה"], kind: "debt", amount: 100 * MAX_PAIR_ACTIVE, note: "", date, createdAt: 0,
    }));
    await t.run((ctx) => archivePair(ctx, F.ids["אבא"], F.ids["דנה"], null));
    const archived = await t.run((ctx) => ctx.db.query("entries").collect().then((r) => r.filter((e) => e.archived).length));
    expect(archived).toBe(0);
  });
});
