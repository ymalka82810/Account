// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import { ACTIVITY_KEEP_MS } from "../convex/activity";
import { newDb, seedFamily, T } from "./helpers/seed";

const DAY = 24 * 60 * 60 * 1000;
let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent", pin: "1234" }, { name: "דנה", role: "child" }]);
});

const count = (table: any) => t.run(async (ctx) => (await (ctx.db.query(table) as any).collect()).length);

describe("ניקוי יומי (maintenance.cleanup)", () => {
  it("מוחק כניסות שפג תוקפן ומשאיר כניסות בתוקף", async () => {
    await t.run((ctx) => ctx.db.insert("sessions", { personId: A.ids["דנה"], tokenHash: "old", expiresAt: Date.now() - 1000 }));
    expect(await count("sessions")).toBe(3);
    await t.mutation(internal.maintenance.cleanup, {});
    expect(await count("sessions")).toBe(2);
  });

  it("מוחק מוני הגבלת קצב ישנים מיממה, ומשאיר עדכניים", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("throttles", { key: "old", windowStart: Date.now() - 2 * DAY, count: 3 });
      await ctx.db.insert("throttles", { key: "new", windowStart: Date.now() - 60_000, count: 3 });
    });
    await t.mutation(internal.maintenance.cleanup, {});
    const left = await t.run((ctx) => ctx.db.query("throttles").collect());
    expect(left.map((x) => x.key)).toEqual(["new"]);
  });

  it("מוחק קודי אימות שפג תוקפם", async () => {
    await t.run(async (ctx) => {
      const base = { personId: A.ids["אבא"], purpose: "pinChange" as const, codeHash: "h", salt: "s", attempts: 0 };
      await ctx.db.insert("emailCodes", { ...base, expiresAt: Date.now() - 1 });
      await ctx.db.insert("emailCodes", { ...base, purpose: "pinReset", expiresAt: Date.now() + 60_000 });
    });
    await t.mutation(internal.maintenance.cleanup, {});
    const left = await t.run((ctx) => ctx.db.query("emailCodes").collect());
    expect(left.map((x) => x.purpose)).toEqual(["pinReset"]);
  });

  it("כרטיס מכשיר שפג נמחק; כרטיס ישן בלי expiresAt נשאר", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("devicePasses", { familyId: A.familyId, passHash: "expired", createdAt: 0, expiresAt: Date.now() - 1 });
      await ctx.db.insert("devicePasses", { familyId: A.familyId, passHash: "legacy", createdAt: Date.now() });
      await ctx.db.insert("devicePasses", { familyId: A.familyId, passHash: "valid", createdAt: Date.now(), expiresAt: Date.now() + DAY });
    });
    await t.mutation(internal.maintenance.cleanup, {});
    const left = (await t.run((ctx) => ctx.db.query("devicePasses").collect())).map((p) => p.passHash).sort();
    expect(left).toEqual(["legacy", "valid"]);
  });

  it("יומן פעולות: שורות ישנות מתקופת השמירה נמחקות", async () => {
    await t.run(async (ctx) => {
      const base = { familyId: A.familyId, actorId: A.ids["אבא"], actorName: "אבא", kind: "debt_add" };
      await ctx.db.insert("activity", { ...base, at: Date.now() - ACTIVITY_KEEP_MS - DAY });
      await ctx.db.insert("activity", { ...base, at: Date.now() });
    });
    await t.mutation(internal.maintenance.cleanup, {});
    expect(await count("activity")).toBe(1);
  });

  it("לא נוגע בנתונים אמיתיים (אנשים, רשומות, משפחות)", async () => {
    await t.run((ctx) => ctx.db.insert("entries", {
      familyId: A.familyId, kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 100, note: "", date: "2020-01-01",
      createdBy: A.ids["אבא"], createdAt: 0,
    } as any));
    await t.mutation(internal.maintenance.cleanup, {});
    expect(await count("entries")).toBe(1);
    expect(await count("people")).toBe(2);
    expect(await count("families")).toBe(1);
  });
});
