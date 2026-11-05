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
