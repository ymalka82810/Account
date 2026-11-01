import { beforeEach, describe, expect, test, vi } from "vitest";

// הפנקס שומר ב-localStorage ומודולים שהוא מייבא נוגעים ב-window; בסביבת הבדיקה אין דפדפן, אז מדמים את המינימום.
(globalThis as any).window = globalThis;
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

async function fresh() {
  store.clear();
  vi.resetModules();
  // @ts-ignore - מודול JS של הפרונטאנד
  return await import("../src-react/lib/notebook.js");
}

describe("קיזוז חובות בפנקס האישי", () => {
  let nb: any;
  beforeEach(async () => { nb = await fresh(); });

  const add = (dir: string, name: string, amount: number, date = "2026-11-01") =>
    nb.addEntry({ dir, name, amount, note: "", date });
  const state = () => JSON.parse(store.get(nb.NOTEBOOK_KEY)!);
  const openSum = (dir: string) =>
    state().entries.filter((e: any) => !e.paid && e.dir === dir).reduce((s: number, e: any) => s + e.amount, 0);

  test("אין מועמדים בלי חובות משני הצדדים", () => {
    add("iowe", "שמואל", 5600);
    add("owed", "דני", 4500);
    expect(nb.offsetCandidates()).toHaveLength(0);
    expect(nb.offsetPerson(state().people[0].id)).toBe(0);
  });

  test("קיזוז סוגר עד הסכום הקטן ומשאיר את ההפרש", () => {
    add("iowe", "שמואל", 5600);
    add("owed", "שמואל", 4500);
    add("owed", "שמואל", 6500);
    const [c] = nb.offsetCandidates();
    expect(c.overlap).toBe(5600);
    expect(nb.offsetPerson(c.person.id)).toBe(5600);
    expect(openSum("iowe")).toBe(0);
    expect(openSum("owed")).toBe(5400); // 4500+6500-5600
    expect(nb.offsetCandidates()).toHaveLength(0);
  });

  test("רישום שמכוסה חלקית מתפצל, והסכום הכולל נשמר", () => {
    add("iowe", "שמואל", 1000);
    add("owed", "שמואל", 3000);
    nb.offsetPerson(state().people[0].id);
    const paid = state().entries.filter((e: any) => e.paid);
    expect(paid.map((e: any) => e.amount).sort()).toEqual([1000, 1000]);
    expect(openSum("owed")).toBe(2000);
    expect(state().entries.reduce((s: number, e: any) => s + (e.dir === "owed" ? e.amount : 0), 0)).toBe(3000);
  });

  test("מקזז מהישן לחדש ולא נוגע באנשים אחרים", () => {
    add("owed", "שמואל", 700, "2026-10-01"); // ישן
    add("owed", "שמואל", 700, "2026-11-01"); // חדש
    add("iowe", "שמואל", 700);
    add("iowe", "דני", 900);
    nb.offsetPerson(state().people.find((p: any) => p.name === "שמואל").id);
    const open = state().entries.filter((e: any) => !e.paid);
    expect(open.map((e: any) => [e.name, e.dir, e.date, e.amount]).sort())
      .toEqual([["דני", "iowe", "2026-11-01", 900], ["שמואל", "owed", "2026-11-01", 700]].sort());
  });
});
