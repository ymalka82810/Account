// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, setRates, T } from "./helpers/seed";

// חוב במטבע זר: בזמן הרישום בוחרים אם הוא יוחזר לפי השער ביום ההלוואה או ביום ההחזר, והשער של אותו יום נשמר בחוב.
const today = "2026-01-15";
const debt = (token: string, from: any, to: any, amount: number, extra: object = {}) =>
  ({ token, kind: "debt" as const, from, to, amount, note: "", date: today, ...extra });
const pay = (token: string, from: any, to: any, amount: number, debtId?: any) =>
  ({ token, kind: "payment" as const, from, to, amount, note: "", date: today, ...(debtId ? { debtId } : {}) });

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let dana: any, abba: any, tok: string;

const moveRates = (rates: Record<string, number>) => t.run(async (ctx) => {
  const r = await ctx.db.query("fxRates").first();
  await ctx.db.patch(r!._id, { rates });
});
const row = (id: any) => t.run((ctx) => ctx.db.get(id)) as Promise<any>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }]);
  dana = A.ids["דנה"]; abba = A.ids["אבא"]; tok = A.tokens["אבא"];
});

describe("חוב במטבע זר: שער יום ההלוואה או יום ההחזר", () => {
  it("בחוב במטבע זר נשמרים שער היום והבחירה; בחוב במטבע המשפחה לא נשמר כלום", async () => {
    await setRates(t, { USD: 1, ILS: 4, EUR: 0.5 });
    const d = await row(await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "loan" })));
    expect(d.rateAt).toBe("loan");
    expect(d.fx).toEqual({ USD: 1, ILS: 4 });
    const local = await row(await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { rateAt: "loan" })));
    expect(local.rateAt).toBeUndefined();
    expect(local.fx).toBeUndefined();
  });

  it("בלי בחירה (גרסה ישנה של האפליקציה, תור המתנה) החוב מוחזר לפי השער ביום ההחזר", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const d = await row(await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD" })));
    expect(d.rateAt).toBe("payment");
    expect(d.fx).toEqual({ USD: 1, ILS: 4 });
  });

  it("לפי השער ביום ההלוואה: הסכום בשקלים נשאר קבוע גם כשהשער זז, והחוב נסגר ומאורכב", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "loan" })); // $100 = ₪400
    await moveRates({ USD: 1, ILS: 2 }); // היום $100 שווים רק ₪200
    // לפי שער היום כבר ₪200 סוגרים את החוב; לפי שער יום ההלוואה צריך ₪400, ורק מעבר לזה (עם מרווח העיגול) זה יותר מדי
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 42000, d))).rejects.toThrow("אי אפשר להחזיר יותר");
    await t.mutation(api.entries.add, pay(tok, dana, abba, 20000, d)); // חצי
    expect((await row(d)).archived).toBeUndefined();
    await t.mutation(api.entries.add, pay(tok, dana, abba, 20000, d)); // והחצי השני
    expect((await row(d)).archived).toBe(true);
  });

  it("לפי השער ביום ההחזר: אותו חוב נסגר בסכום של שער היום", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "payment" }));
    await moveRates({ USD: 1, ILS: 2 });
    await expect(t.mutation(api.entries.add, pay(tok, dana, abba, 40000, d))).rejects.toThrow("אי אפשר להחזיר יותר");
    await t.mutation(api.entries.add, pay(tok, dana, abba, 20000, d)); // ₪200 = $100 היום
    expect((await row(d)).archived).toBe(true);
  });

  it("החזר כללי (לא מקושר) על חוב לפי שער יום ההלוואה מתחלק גם הוא לפי אותו שער", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "loan" }));
    await moveRates({ USD: 1, ILS: 2 });
    await t.mutation(api.entries.add, pay(tok, dana, abba, 40000));
    expect((await row(d)).archived).toBe(true);
  });

  it("לפי השער ביום ההלוואה בלי שערים: החוב לא נרשם", async () => {
    await expect(t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "loan" })))
      .rejects.toThrow("שערי ההמרה עוד לא נטענו");
  });

  it("data:get מחזיר את הבחירה ואת השער, ו-closedDebts מחזיר רק חובות שלי שנסגרו", async () => {
    await setRates(t, { USD: 1, ILS: 4 });
    const d = await t.mutation(api.entries.add, debt(tok, dana, abba, 10000, { currency: "USD", rateAt: "loan" }));
    const open = await t.mutation(api.entries.add, debt(tok, dana, abba, 500));
    const data: any = await t.query(api.data.get, { token: A.tokens["דנה"] });
    const got = data.entries.find((e: any) => e.id === d);
    expect(got.rateAt).toBe("loan");
    expect(got.fx).toEqual({ USD: 1, ILS: 4 });
    expect(await t.query(api.data.closedDebts, { token: A.tokens["דנה"] })).toEqual([]);
    await t.mutation(api.entries.add, pay(tok, dana, abba, 40000, d));
    // החוב השני עדיין פתוח, אז הכיוון כולו לא מאורכב
    expect(await t.query(api.data.closedDebts, { token: A.tokens["דנה"] })).toEqual([]);
    await t.mutation(api.entries.add, pay(tok, dana, abba, 500, open));
    const closed = await t.query(api.data.closedDebts, { token: A.tokens["דנה"] });
    expect(closed.map((e: any) => e.id).sort()).toEqual([d, open].sort());
    expect(closed.find((e: any) => e.id === d)).toMatchObject({ from: dana, to: abba, amount: 10000, currency: "USD" });
    // בן משפחה אחר לא מקבל חובות שלא קשורים אליו
    const B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }]);
    expect(await t.query(api.data.closedDebts, { token: B.tokens["אמא"] })).toEqual([]);
  });
});
