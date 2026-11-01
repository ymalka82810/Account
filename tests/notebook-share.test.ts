// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "נועם", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

const share = (name: string) => t.run(async (ctx) => {
  const p = (await ctx.db.query("people").collect()).find((x) => x.name === name)!;
  await ctx.db.patch(p._id, { notebookShared: true });
  return p._id;
});
const nbData = JSON.stringify({ currency: "ILS", entries: [{ id: "1", dir: "iowe", name: "סבא", amount: 5000, note: "גלידה", date: "2026-10-01", paid: false }] });

describe("שיתוף הפנקס האישי עם ההורים (צפייה בלבד)", () => {
  it("ילד/ה שלא אישר/ה לא משתף/ת כלום", async () => {
    expect(await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nbData })).toEqual({ shared: false });
    expect(await t.run((ctx) => ctx.db.query("notebooks").collect())).toHaveLength(0);
  });

  it("ילד/ה שאישר/ה משלח/ת עותק, והורה במשפחה רואה אותו", async () => {
    const dana = await share("דנה");
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nbData });
    const res: any = await t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: dana });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ name: "סבא", amount: 5000, dir: "iowe" });
    // עדכון מחליף את העותק ולא מוסיף עוד אחד
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: JSON.stringify({ currency: "ILS", entries: [] }) });
    expect(await t.run((ctx) => ctx.db.query("notebooks").collect())).toHaveLength(1);
    expect((await t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: dana }) as any).entries).toHaveLength(0);
  });

  it("רק הורה מהמשפחה רואה: לא ילד אחר ולא הורה ממשפחה זרה", async () => {
    const dana = await share("דנה");
    await share("נועם");
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nbData });
    await expect(t.query(api.notebook.forChild, { token: A.tokens["נועם"], personId: dana })).rejects.toThrow("רק הורים");
    await expect(t.query(api.notebook.forChild, { token: B.tokens["אמא"], personId: dana })).rejects.toThrow("אדם לא קיים");
  });

  it("אין כתיבה להורה: sync של הורה לא עושה כלום", async () => {
    expect(await t.mutation(api.notebook.sync, { token: A.tokens["אבא"], data: nbData })).toEqual({ shared: false });
  });

  it("שינוי תפקיד של הילד/ה מוחק את העותק וחוסם צפייה", async () => {
    const dana = await share("דנה");
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nbData });
    await t.run(async (ctx) => { await ctx.db.patch(dana, { role: "teen", notebookShared: false }); });
    expect(await t.query(api.notebook.forChild, { token: A.tokens["אבא"], personId: dana })).toBeNull();
  });

  it("הסרת ילד/ה מוחקת את העותק", async () => {
    const dana = await share("דנה");
    await t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: nbData });
    await t.mutation(api.people.remove, { token: A.tokens["אבא"], id: dana });
    expect(await t.run((ctx) => ctx.db.query("notebooks").collect())).toHaveLength(0);
  });

  it("נתונים לא תקינים נדחים", async () => {
    await share("דנה");
    await expect(t.mutation(api.notebook.sync, { token: A.tokens["דנה"], data: "not json" })).rejects.toThrow("לא תקין");
  });
});
