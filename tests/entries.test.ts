// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, setRates, T } from "./helpers/seed";

const today = "2026-01-15";
const debt = (token: string, from: any, to: any, amount = 10000, extra: object = {}) =>
  ({ token, kind: "debt" as const, from, to, amount, note: "", date: today, ...extra });
const pay = (token: string, from: any, to: any, amount: number, debtId?: any) =>
  ({ token, kind: "payment" as const, from, to, amount, note: "", date: today, ...(debtId ? { debtId } : {}) });

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "גיל", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "נועם", role: "child" }]);
});

const entriesOf = (familyId: any) =>
  t.run((ctx) => ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect());

describe("בידוד בין משפחות", () => {
  it("הורה ממשפחה אחת לא יכול לרשום חוב על אדם ממשפחה אחרת", async () => {
    await expect(t.mutation(api.entries.add, debt(A.tokens["אבא"], A.ids["דנה"], B.ids["נועם"])))
      .rejects.toThrow("אדם לא קיים");
    await expect(t.mutation(api.entries.add, debt(A.tokens["אבא"], B.ids["נועם"], A.ids["דנה"])))
      .rejects.toThrow("אדם לא קיים");
    expect(await entriesOf(A.familyId)).toHaveLength(0);
    expect(await entriesOf(B.familyId)).toHaveLength(0);
  });

  it("אי אפשר לרשום חוב בין שני אנשים ממשפחה זרה", async () => {
    await expect(t.mutation(api.entries.add, debt(A.tokens["אבא"], B.ids["אמא"], B.ids["נועם"])))
      .rejects.toThrow("אדם לא קיים");
  });

  it("אי אפשר לקשר החזר לחוב של משפחה אחרת", async () => {
    const foreign = await t.mutation(api.entries.add, debt(B.tokens["אמא"], B.ids["נועם"], B.ids["אמא"]));
    await expect(t.mutation(api.entries.add, pay(A.tokens["אבא"], A.ids["דנה"], A.ids["אבא"], 100, foreign)))
      .rejects.toThrow("החוב לא נמצא");
  });

  it("הורה לא יכול לאשר, לדחות או למחוק רשומה של משפחה אחרת", async () => {
    const pending = await t.mutation(api.entries.add, debt(B.tokens["נועם"], B.ids["נועם"], B.ids["אמא"]));
    const approved = await t.mutation(api.entries.add, debt(B.tokens["אמא"], B.ids["נועם"], B.ids["אמא"]));
    await t.mutation(api.entries.approve, { token: A.tokens["אבא"], id: pending });
    await t.mutation(api.entries.reject, { token: A.tokens["אבא"], id: pending });
    await t.mutation(api.entries.remove, { token: A.tokens["אבא"], id: approved });
    const rows = await entriesOf(B.familyId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r._id === pending)?.status).toBe("pending");
  });

  it("data.get מחזיר רק את נתוני המשפחה של המחובר/ת", async () => {
    await t.mutation(api.entries.add, debt(B.tokens["אמא"], B.ids["נועם"], B.ids["אמא"]));
    const d: any = await t.query(api.data.get, { token: A.tokens["אבא"] });
    expect(d.entries).toHaveLength(0);
    expect(d.people.map((p: any) => p.name).sort()).toEqual(["אבא", "גיל", "דנה"].sort());
  });

  it("טוקן לא תקין או שפג תוקפו לא נכנס", async () => {
    await expect(t.mutation(api.entries.add, debt("nope", A.ids["דנה"], A.ids["אבא"]))).rejects.toThrow("צריך להיכנס מחדש");
    expect(await t.query(api.data.get, { token: "nope" })).toBeNull();
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("sessions").collect()) await ctx.db.patch(s._id, { expiresAt: Date.now() - 1 });
    });
    expect(await t.query(api.data.get, { token: A.tokens["אבא"] })).toBeNull();
  });
});

describe("הרשאות בתוך משפחה", () => {
  it("ילד רושם רק רשומות שקשורות אליו, והן ממתינות לאישור", async () => {
    await expect(t.mutation(api.entries.add, debt(A.tokens["דנה"], A.ids["אבא"], A.ids["גיל"])))
      .rejects.toThrow("אפשר לרשום רק חובות שקשורים אליך");
    const id = await t.mutation(api.entries.add, debt(A.tokens["דנה"], A.ids["דנה"], A.ids["אבא"]));
    expect((await entriesOf(A.familyId)).find((r) => r._id === id)?.status).toBe("pending");
  });

  it("רשומה שרשם הורה מאושרת מיד", async () => {
    const id = await t.mutation(api.entries.add, debt(A.tokens["אבא"], A.ids["דנה"], A.ids["אבא"]));
    expect((await entriesOf(A.familyId)).find((r) => r._id === id)?.status).toBeUndefined();
  });

  it("ילד לא רואה רשומות של אחרים", async () => {
    await t.mutation(api.entries.add, debt(A.tokens["אבא"], A.ids["גיל"], A.ids["אבא"]));
    await t.mutation(api.entries.add, debt(A.tokens["אבא"], A.ids["דנה"], A.ids["אבא"]));
    const d: any = await t.query(api.data.get, { token: A.tokens["דנה"] });
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0].from).toBe(A.ids["דנה"]);
  });

  it("ילד לא יכול לאשר או לדחות", async () => {
    const id = await t.mutation(api.entries.add, debt(A.tokens["דנה"], A.ids["דנה"], A.ids["אבא"]));
    await expect(t.mutation(api.entries.approve, { token: A.tokens["דנה"], id })).rejects.toThrow("רק הורים");
    await expect(t.mutation(api.entries.reject, { token: A.tokens["דנה"], id })).rejects.toThrow("רק הורים");
  });

  it("ילד מבטל רשומה שלו כל עוד היא ממתינה, אבל לא רשומה מאושרת ישנה", async () => {
    const pending = await t.mutation(api.entries.add, debt(A.tokens["דנה"], A.ids["דנה"], A.ids["אבא"]));
    await t.mutation(api.entries.remove, { token: A.tokens["דנה"], id: pending });
    expect(await entriesOf(A.familyId)).toHaveLength(0);

    const id = await t.mutation(api.entries.add, debt(A.tokens["דנה"], A.ids["דנה"], A.ids["אבא"]));
    await t.mutation(api.entries.approve, { token: A.tokens["אבא"], id });
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt: Date.now() - 11 * 60 * 1000 }); });
    await expect(t.mutation(api.entries.remove, { token: A.tokens["דנה"], id })).rejects.toThrow("10 הדקות");
  });

  it("אדם לא חייב לעצמו, סכום ותאריך נבדקים", async () => {
    const tok = A.tokens["אבא"];
    await expect(t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["דנה"]))).rejects.toThrow("לעצמו");
    for (const amount of [0, -5, 1.5, 1_001_001]) {
      await expect(t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["אבא"], amount))).rejects.toThrow("סכום לא תקין");
    }
    await expect(t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["אבא"], 100, { date: "15/01/2026" })))
      .rejects.toThrow("תאריך");
  });
});

describe("החזר על חוב", () => {
  it("לא מאפשר להחזיר יותר ממה שנשאר, ומסרב לחוב ששולם במלואו", async () => {
    const tok = A.tokens["אבא"], dana = A.ids["דנה"], abba = A.ids["אבא"];
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000));
    await t.mutation(api.entries.add, pay(tok, dana, abba, 6000, d));
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 5000, d))).rejects.toThrow("אי אפשר להחזיר יותר");
    await t.mutation(api.entries.add, pay(tok, dana, abba, 4000, d));
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 1, d))).rejects.toThrow("כבר שולם");
  });

  it("לא מקשרים החזר לחוב בכיוון הפוך, לחוב ממתין, או לרשומה שאינה חוב", async () => {
    const dana = A.ids["דנה"], abba = A.ids["אבא"], tok = A.tokens["אבא"];
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba));
    await expect(t.mutation(api.entries.add, pay(tok, abba, dana, 100, d))).rejects.toThrow("לא מתאים");
    const pendingDebt = await t.mutation(api.entries.add, debt(A.tokens["דנה"], dana, abba));
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 100, pendingDebt))).rejects.toThrow("החוב לא נמצא");
    const p = await t.mutation(api.entries.add, pay(tok, dana, abba, 100));
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 100, p))).rejects.toThrow("החוב לא נמצא");
  });

  it("debtId מותר רק בהחזר", async () => {
    const tok = A.tokens["אבא"];
    const d = await t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["אבא"]));
    await expect(t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["אבא"], 100, { debtId: d })))
      .rejects.toThrow("רק החזר");
  });

  it("החזר על חוב במטבע אחר שומר את שערי הרגע, והחישוב נשאר לפי שער ההחזר", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const dana = A.ids["דנה"], abba = A.ids["אבא"], tok = A.tokens["אבא"];
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD" })); // $100
    const p = await t.mutation(api.entries.add, pay(tok, dana, abba, 20000, d)); // ₪200 = $50
    expect((await t.run((ctx) => ctx.db.get(p)))?.fx).toEqual({ ILS: 4, USD: 1 });
    // שער השוק זז, אבל מה ששולם כבר לא משתנה: נשארו $50, שהם ₪100 לפי השער החדש
    await t.run(async (ctx) => {
      const r = await ctx.db.query("fxRates").first();
      await ctx.db.patch(r!._id, { rates: { USD: 1, ILS: 2 } });
    });
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 12000, d))).rejects.toThrow("אי אפשר להחזיר יותר");
    await t.mutation(api.entries.add, pay(tok, dana, abba, 10000, d));
  });

  it("בלי שערים, החזר במטבע שונה מהחוב נדחה", async () => {
    const tok = A.tokens["אבא"];
    await t.mutation(api.entries.add, debt(tok, A.ids["דנה"], A.ids["אבא"], 10000, { currency: "USD" }));
    await expect(t.mutation(api.entries.add, pay(tok, A.ids["דנה"], A.ids["אבא"], 1000))).rejects.toThrow("שערי ההמרה");
  });
});
