// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "גיל", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "נועם", role: "child" }]);
});

const goalsSeen = async (token: string) => ((await t.query(api.data.get, { token })) as any).goals;

describe("יעדי חיסכון", () => {
  it("הפקדה של ילד/ה ממתינה לאישור הורה ורק אז נספרת", async () => {
    const id = await t.mutation(api.goals.add, { token: A.tokens["דנה"], name: "אופניים", target: 100000 });
    await t.mutation(api.goals.deposit, { token: A.tokens["דנה"], goalId: id, amount: 20000 });
    let [g] = await goalsSeen(A.tokens["דנה"]);
    expect(g.saved).toBe(0);
    expect(g.pending).toHaveLength(1);
    await t.mutation(api.goals.decide, { token: A.tokens["אבא"], depositId: g.pending[0].id, approve: true });
    [g] = await goalsSeen(A.tokens["אבא"]);
    expect(g.saved).toBe(20000);
    expect(g.pending).toHaveLength(0);
  });

  it("הפקדה של הורה נספרת מיד, ודחייה מוחקת הפקדה ממתינה", async () => {
    const id = await t.mutation(api.goals.add, { token: A.tokens["אבא"], personId: A.ids["דנה"], name: "גיטרה", target: 50000 });
    await t.mutation(api.goals.deposit, { token: A.tokens["אבא"], goalId: id, amount: 5000 });
    await t.mutation(api.goals.deposit, { token: A.tokens["דנה"], goalId: id, amount: 1000 });
    const [g] = await goalsSeen(A.tokens["אבא"]);
    expect(g.saved).toBe(5000);
    await t.mutation(api.goals.decide, { token: A.tokens["אבא"], depositId: g.pending[0].id, approve: false });
    expect((await goalsSeen(A.tokens["דנה"]))[0].pending).toHaveLength(0);
  });

  it("בידוד: ילד/ה לא רואה יעד של אחיו/ה, ומשפחה אחרת לא נוגעת", async () => {
    const id = await t.mutation(api.goals.add, { token: A.tokens["דנה"], name: "אופניים", target: 100000 });
    expect(await goalsSeen(A.tokens["גיל"])).toHaveLength(0);
    await expect(t.mutation(api.goals.deposit, { token: A.tokens["גיל"], goalId: id, amount: 100 })).rejects.toThrow("היעד לא קיים");
    await expect(t.mutation(api.goals.deposit, { token: B.tokens["אמא"], goalId: id, amount: 100 })).rejects.toThrow("היעד לא קיים");
    await expect(t.mutation(api.goals.add, { token: A.tokens["גיל"], personId: A.ids["דנה"], name: "x", target: 100 }))
      .rejects.toThrow("רק הורים");
    await expect(t.mutation(api.goals.add, { token: A.tokens["אבא"], personId: B.ids["נועם"], name: "x", target: 100 }))
      .rejects.toThrow("אדם לא קיים");
  });

  it("מחיקת היעד מוחקת גם את ההפקדות", async () => {
    const id = await t.mutation(api.goals.add, { token: A.tokens["דנה"], name: "אופניים", target: 100000 });
    await t.mutation(api.goals.deposit, { token: A.tokens["דנה"], goalId: id, amount: 100 });
    await t.mutation(api.goals.remove, { token: A.tokens["דנה"], goalId: id });
    expect(await t.run((ctx) => ctx.db.query("goalDeposits").collect())).toHaveLength(0);
  });
});

describe("יעדי חיסכון: קשירת מכשיר, תקרות ויומן", () => {
  let C: Awaited<ReturnType<typeof seedFamily>>;
  const bind = (id: any) => t.run((ctx) => ctx.db.insert("bioKeys", { personId: id, kind: "android", credentialId: "k", publicKey: "x", alg: -7, createdAt: Date.now() }));
  const log = async () => (await t.query(api.activity.list, { token: C.tokens["אבא"] })) as any[];
  const NOT_BOUND = "צריך לקשר את המכשיר";
  beforeEach(async () => {
    C = await seedFamily(t, "C", [{ name: "אבא", role: "parent" }, { name: "אמא", role: "parent" }, { name: "דנה", role: "child" }]);
    await bind(C.ids["אבא"]); // אמא לא קשורה למכשיר
  });

  it("הורה לא קשור נדחה ב-add, deposit, remove ו-decide; הורה קשור וילד ממשיכים", async () => {
    const id = await t.mutation(api.goals.add, { token: C.tokens["אבא"], personId: C.ids["דנה"], name: "גיטרה", target: 50000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 1000 });
    const [g] = await goalsSeen(C.tokens["אבא"]);
    await expect(t.mutation(api.goals.add, { token: C.tokens["אמא"], personId: C.ids["דנה"], name: "x", target: 100 })).rejects.toThrow(NOT_BOUND);
    await expect(t.mutation(api.goals.deposit, { token: C.tokens["אמא"], goalId: id, amount: 100 })).rejects.toThrow(NOT_BOUND);
    await expect(t.mutation(api.goals.decide, { token: C.tokens["אמא"], depositId: g.pending[0].id, approve: true })).rejects.toThrow(NOT_BOUND);
    await expect(t.mutation(api.goals.remove, { token: C.tokens["אמא"], goalId: id })).rejects.toThrow(NOT_BOUND);
    const [still] = await goalsSeen(C.tokens["אבא"]);
    expect(still.saved).toBe(0);
    expect(still.pending).toHaveLength(1);
    await t.mutation(api.goals.decide, { token: C.tokens["אבא"], depositId: g.pending[0].id, approve: true });
    await t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: id, amount: 500 });
    expect((await goalsSeen(C.tokens["דנה"]))[0].saved).toBe(1500);
  });

  it("הורה שאין במשפחה שלו הורה קשור ממשיך לפעול", async () => {
    const D = await seedFamily(t, "D", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }]);
    await t.mutation(api.goals.add, { token: D.tokens["אבא"], personId: D.ids["דנה"], name: "x", target: 100 });
  });

  it("תקרה להפקדות ממתינות ליעד, ותקרה כללית", async () => {
    const id = await t.mutation(api.goals.add, { token: C.tokens["דנה"], name: "אופניים", target: 100000 });
    for (let i = 0; i < 20; i++) await t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 100 });
    await expect(t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 100 })).rejects.toThrow("הרבה הפקדות שממתינות");
    // הורה לא נעצר בתקרת הממתינות, אבל כן בתקרה הכללית
    await t.run(async (ctx) => {
      for (let i = 0; i < 480; i++) await ctx.db.insert("goalDeposits", { goalId: id, familyId: C.familyId, amount: 1, createdBy: C.ids["אבא"], createdAt: Date.now() });
    });
    await expect(t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: id, amount: 100 })).rejects.toThrow("יותר מדי הפקדות");
  });

  it("הפקדה ליעד שהושג נדחית", async () => {
    const id = await t.mutation(api.goals.add, { token: C.tokens["אבא"], personId: C.ids["דנה"], name: "גיטרה", target: 1000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: id, amount: 1000 });
    await expect(t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 100 })).rejects.toThrow("היעד כבר הושג");
    await expect(t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: id, amount: 100 })).rejects.toThrow("היעד כבר הושג");
  });

  it("השליפה מחזירה את אותו מידע: סכומים, ממתינות, וכל משפחה לחוד", async () => {
    const a = await t.mutation(api.goals.add, { token: C.tokens["אבא"], personId: C.ids["דנה"], name: "א", target: 5000 });
    const b = await t.mutation(api.goals.add, { token: C.tokens["דנה"], name: "ב", target: 7000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: a, amount: 300 });
    await t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: a, amount: 200 });
    await t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: b, amount: 700 });
    const seen = await goalsSeen(C.tokens["אבא"]);
    expect(seen.map((g: any) => [g.name, g.saved, g.pending.map((p: any) => p.amount)]).sort())
      .toEqual([["א", 300, [200]], ["ב", 700, []]]);
    expect(await goalsSeen(A.tokens["אבא"])).toHaveLength(0);
  });

  it("ילד/ה לא מוחק/ת יעד עם הפקדות מאושרות, הורה כן, וזה נרשם ביומן", async () => {
    const id = await t.mutation(api.goals.add, { token: C.tokens["דנה"], name: "אופניים", target: 100000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["אבא"], goalId: id, amount: 4000 });
    await expect(t.mutation(api.goals.remove, { token: C.tokens["דנה"], goalId: id })).rejects.toThrow("רק עם הורה");
    expect(await goalsSeen(C.tokens["דנה"])).toHaveLength(1);
    await t.mutation(api.goals.remove, { token: C.tokens["אבא"], goalId: id });
    expect(await goalsSeen(C.tokens["אבא"])).toHaveLength(0);
    expect((await log()).map((r) => r.kind).sort()).toEqual(["goal_add", "goal_deposit", "goal_removed"]);
  });

  it("פעולות יעדים נרשמות ביומן עם שם היעד והסכום", async () => {
    const id = await t.mutation(api.goals.add, { token: C.tokens["דנה"], name: "אופניים", target: 100000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 2000 });
    await t.mutation(api.goals.deposit, { token: C.tokens["דנה"], goalId: id, amount: 3000 });
    const [g] = await goalsSeen(C.tokens["אבא"]);
    await t.mutation(api.goals.decide, { token: C.tokens["אבא"], depositId: g.pending[0].id, approve: true });
    await t.mutation(api.goals.decide, { token: C.tokens["אבא"], depositId: g.pending[1].id, approve: false });
    const rows = await log();
    expect(rows.map((r) => r.kind).sort()).toEqual(["goal_add", "goal_deposit_approved", "goal_deposit_pending", "goal_deposit_pending", "goal_deposit_rejected"]);
    expect(rows.find((r) => r.kind === "goal_deposit_approved")).toMatchObject({ actor: "אבא", subject: "אופניים", amount: 2000 });
  });
});
