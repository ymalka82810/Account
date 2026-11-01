// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T } from "./helpers/seed";

// ילד/ה בהורים גרושים: רשומת אדם נפרדת בכל משפחה, ולכל אחת עותק פנקס משלה.
// ההורים של כל משפחה רואים רק את העותק של המשפחה שלהם, ולא יודעים שיש משפחה נוספת.
let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "דנה", role: "child" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

const share = (id: any) => t.run(async (ctx) => { await ctx.db.patch(id, { notebookShared: true }); });
const nb = (name: string) => JSON.stringify({ currency: "ILS", entries: [{ id: "1", dir: "iowe", name, amount: 5000, note: "", date: "2026-10-01", paid: false }] });

describe("פנקס אישי של ילד/ה בשתי משפחות", () => {
  it("כל משפחה מקבלת עותק נפרד דרך הטוקן שלה, וההורה רואה רק את משפחתו", async () => {
    await share(A.ids["דנה"]);
    await share(B.ids["דנה"]);
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nb("סבא") });
    await t.mutation(api.notebook.sync, { token: B.tokens["דנה"], data: nb("סבתא") });

    const rows = await t.run((ctx) => ctx.db.query("notebooks").collect());
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => String(r.familyId))).size).toBe(2);

    const seenByDad: any = await t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: A.ids["דנה"] });
    const seenByMom: any = await t.query(api.notebook.forChild, { token: B.tokens["אמא"], personId: B.ids["דנה"] });
    expect(seenByDad.entries[0].name).toBe("סבא");
    expect(seenByMom.entries[0].name).toBe("סבתא");
  });

  it("הורה לא יכול לקרוא את הרשומה של הילד/ה במשפחה השנייה", async () => {
    await share(A.ids["דנה"]);
    await share(B.ids["דנה"]);
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nb("סבא") });
    await t.mutation(api.notebook.sync, { token: B.tokens["דנה"], data: nb("סבתא") });
    await expect(t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: B.ids["דנה"] })).rejects.toThrow("אדם לא קיים");
    await expect(t.query(api.notebook.forChild, { token: B.tokens["אמא"], personId: A.ids["דנה"] })).rejects.toThrow("אדם לא קיים");
  });

  it("משפחה שהילד/ה לא אישר/ה בה לא מקבלת עותק", async () => {
    await share(A.ids["דנה"]);
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nb("סבא") });
    expect(await t.mutation(api.notebook.sync, { token: B.tokens["דנה"], data: nb("סבא") })).toEqual({ shared: false });
    const rows = await t.run((ctx) => ctx.db.query("notebooks").collect());
    expect(rows).toHaveLength(1);
    expect(await t.query(api.notebook.forChild, { token: B.tokens["אמא"], personId: B.ids["דנה"] })).toBeNull();
  });

  it("הסרת הילד/ה ממשפחה אחת מוחקת רק את העותק שלה", async () => {
    await share(A.ids["דנה"]);
    await share(B.ids["דנה"]);
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nb("סבא") });
    await t.mutation(api.notebook.sync, { token: B.tokens["דנה"], data: nb("סבתא") });
    await t.mutation(api.people.remove, { token: B.tokens["אמא"], id: B.ids["דנה"] });

    const rows = await t.run((ctx) => ctx.db.query("notebooks").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].personId).toEqual(A.ids["דנה"]);
    const seenByDad: any = await t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: A.ids["דנה"] });
    expect(seenByDad.entries[0].name).toBe("סבא");
  });
});
