// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { openDebtsOf, pairOwes, setFx } from "../src-react/lib/computations.js";
import { newDb, seedFamily, setRates, T } from "./helpers/seed";

const date = "2026-01-15";
const debt = (token: string, from: any, to: any, amount = 10000, extra: object = {}) =>
  ({ token, kind: "debt" as const, from, to, amount, note: "חוב", date, ...extra });
const pay = (token: string, from: any, to: any, amount: number, debtId?: any) =>
  ({ token, kind: "payment" as const, from, to, amount, note: "", date, ...(debtId ? { debtId } : {}) });

let t: T;
let F: Awaited<ReturnType<typeof seedFamily>>;
const dad = () => F.tokens["אבא"];

beforeEach(async () => {
  t = newDb();
  F = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "גיל", role: "child" }]);
});

const rows = () => t.run((ctx) => ctx.db.query("entries").collect());
const active = async (token = dad()) => ((await t.query(api.data.get, { token })) as any).entries;
const history = async (token: string, all = false) =>
  (await t.query(api.history.page, { token, all, paginationOpts: { numItems: 50, cursor: null } })).page as any[];

describe("ארכוב של זוג שנסגר", () => {
  it("חוב ששולם במלואו יוצא מהנתונים הראשיים ונשאר בהיסטוריה", async () => {
    const d = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 10000));
    await t.mutation(api.entries.add, pay(dad(), F.ids["אבא"], F.ids["דנה"], 10000, d));
    expect(await active()).toHaveLength(0);
    const h = await history(dad(), true);
    expect(h).toHaveLength(2);
    expect(h.every((e) => e.archived)).toBe(true);
    expect(h.find((e) => e.kind === "payment").debtNote).toBe("חוב");
  });

  it("החזר חלקי לא מארכב", async () => {
    const d = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 10000));
    await t.mutation(api.entries.add, pay(dad(), F.ids["אבא"], F.ids["דנה"], 4000, d));
    expect(await active()).toHaveLength(2);
  });

  it("החזר שממתין לאישור לא מארכב עד שמאשרים אותו", async () => {
    await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 10000));
    const p = await t.mutation(api.entries.add, pay(F.tokens["דנה"], F.ids["אבא"], F.ids["דנה"], 10000));
    expect(await active()).toHaveLength(2);
    await t.mutation(api.entries.approve, { token: dad(), id: p });
    expect(await active()).toHaveLength(0);
  });

  it("חוב חדש אחרי ארכוב נשאר פעיל, והחזר עליו מארכב רק אותו", async () => {
    const d1 = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 10000));
    await t.mutation(api.entries.add, pay(dad(), F.ids["אבא"], F.ids["דנה"], 10000, d1));
    const d2 = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 3000));
    expect(await active()).toHaveLength(1);
    await t.mutation(api.entries.add, pay(dad(), F.ids["אבא"], F.ids["דנה"], 3000, d2));
    expect(await active()).toHaveLength(0);
    expect(await history(dad(), true)).toHaveLength(4);
  });

  it("מחיקת רשומה מאורכבת מחזירה את הכיוון לחישוב ומארכבת מחדש את מה שסגור", async () => {
    const d1 = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 10000));
    await t.mutation(api.entries.add, pay(dad(), F.ids["אבא"], F.ids["דנה"], 10000, d1));
    const d2 = await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 4000));
    await t.mutation(api.entries.remove, { token: dad(), id: d1 });
    // ההחזר של 100 הפך לכללי ומכסה את החוב החדש של 40; נשאר עודף של 60 לטובת מי ששילם.
    const left = await active();
    expect(left.map((e: any) => e.id).sort()).toEqual((await rows()).map((e) => e._id).sort());
    expect(pairOwes(F.ids["אבא"], F.ids["דנה"], left, "ILS")).toBe(-6000);
    expect(left.some((e: any) => e.id === d2)).toBe(true);
  });
});

describe("history.page", () => {
  it("ילד רואה רק רשומות שקשורות אליו, בלי ממתינות של אחרים", async () => {
    await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 100));
    await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["גיל"], 200));
    await t.mutation(api.entries.add, debt(F.tokens["גיל"], F.ids["גיל"], F.ids["אבא"], 300)); // ממתינה, של גיל
    const dana = await history(F.tokens["דנה"]);
    expect(dana.map((e) => e.amount)).toEqual([100]);
    const gil = await history(F.tokens["גיל"]);
    expect(gil.map((e) => e.amount).sort()).toEqual([200, 300]);
  });

  it("הורה: 'שלי' מול 'כל המשפחה', והדפדוף עובד", async () => {
    await t.mutation(api.entries.add, debt(dad(), F.ids["דנה"], F.ids["גיל"], 100)); // לא קשור לאבא
    for (let i = 0; i < 5; i++) await t.mutation(api.entries.add, debt(dad(), F.ids["אבא"], F.ids["דנה"], 100 + i));
    expect(await history(dad(), false)).toHaveLength(5);
    expect(await history(dad(), true)).toHaveLength(6);
    const p1 = await t.query(api.history.page, { token: dad(), all: true, paginationOpts: { numItems: 4, cursor: null } });
    expect(p1.page).toHaveLength(4);
    expect(p1.isDone).toBe(false);
    const p2 = await t.query(api.history.page, { token: dad(), all: true, paginationOpts: { numItems: 4, cursor: p1.continueCursor } });
    expect(p2.page).toHaveLength(2);
    expect(p2.isDone).toBe(true);
  });

  it("בלי כניסה תקינה מחזיר דף ריק", async () => {
    const r = await t.query(api.history.page, { token: "nope", paginationOpts: { numItems: 5, cursor: null } });
    expect(r.page).toEqual([]);
  });
});

describe("הארכוב לא משנה אף יתרה", () => {
  // רצף מקרי של פעולות (חוב, החזר כללי, החזר מקושר, מחיקה, בכמה מטבעות). אחרי כל פעולה היתרה על הרשומות
  // הפעילות שווה לזו שעל כל הרשומות.
  it("יתרות זהות על הרשומות הפעילות ועל כולן", async () => {
    await setRates(t, { ILS: 3.7, USD: 1 });
    setFx("ILS", { ILS: 3.7, USD: 1 });
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const people = [F.ids["אבא"], F.ids["דנה"], F.ids["גיל"]];
    const asClient = (e: any) => ({
      id: e._id, kind: e.kind, from: e.from, to: e.to, amount: e.amount, currency: e.currency ?? "ILS", fx: e.fx ?? null,
      date: e.date, createdAt: e.createdAt ?? e._creationTime, status: e.status ?? "approved", debtId: e.debtId ?? null,
    });
    let archivedSeen = false;
    for (let step = 0; step < 120; step++) {
      const all = await rows();
      const [from, to] = [people[rnd(3)], people[rnd(3)]];
      const op = rnd(10);
      try {
        if (from === to) continue;
        if (op < 3) {
          await t.mutation(api.entries.add, debt(dad(), from, to, (1 + rnd(5)) * 1000, { currency: rnd(3) === 0 ? "USD" : "ILS", date: `2026-01-${10 + (step % 15)}` }));
        } else if (op < 5) {
          await t.mutation(api.entries.add, pay(dad(), from, to, (1 + rnd(6)) * 1000));
        } else if (op < 7) {
          const open = all.filter((e) => e.kind === "debt" && e.from === from && e.to === to && !e.archived && e.status !== "pending");
          if (open.length) await t.mutation(api.entries.add, pay(dad(), from, to, (1 + rnd(4)) * 1000, open[rnd(open.length)]._id));
        } else if (op < 9) {
          // סגירה מלאה של מה שפתוח בכיוון הזה (שווי בשקלים), כדי שהארכוב באמת יקרה
          const sum = openDebtsOf(from, to, all.map(asClient), "ILS").reduce((n: number, x: any) => n + x.value, 0);
          if (sum > 0) await t.mutation(api.entries.add, pay(dad(), from, to, sum));
        } else if (all.length) {
          await t.mutation(api.entries.remove, { token: dad(), id: all[rnd(all.length)]._id });
        }
      } catch { /* פעולות לא חוקיות (למשל החזר מעל החוב) מדלגים */ }
      const full = (await rows()).map(asClient);
      const act = await active();
      archivedSeen ||= act.length < full.length;
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        expect(pairOwes(people[i], people[j], act, "ILS")).toBe(pairOwes(people[i], people[j], full, "ILS"));
      }
    }
    expect(archivedSeen).toBe(true); // אם לא ארכבנו כלום, הבדיקה לא בודקת כלום
  });
});
