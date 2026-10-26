import { describe, expect, it } from "vitest";
import { convert, paidOnDebt } from "../convex/currency";
import { convert as convertClient } from "../src-react/lib/computations.js";

const rates = { USD: 1, ILS: 4, EUR: 0.5 };

describe("convert", () => {
  it("אותו מטבע מחזיר את הסכום כמו שהוא, גם בלי שערים", () => {
    expect(convert(123, "ILS", "ILS", null)).toBe(123);
  });
  it("ממיר דרך הדולר", () => {
    expect(convert(100, "USD", "ILS", rates)).toBe(400);
    expect(convert(400, "ILS", "USD", rates)).toBe(100);
    expect(convert(400, "ILS", "EUR", rates)).toBe(50);
  });
  it("חסר שער או שערים: null ולא NaN/אפס", () => {
    expect(convert(100, "USD", "GBP", rates)).toBeNull();
    expect(convert(100, "USD", "ILS", null)).toBeNull();
    expect(convert(100, "USD", "ILS", { USD: 1, ILS: 0 })).toBeNull();
  });
  it("גרסת השרת והלקוח נותנות אותה תוצאה", () => {
    for (const [a, f, t] of [[1999, "ILS", "EUR"], [5, "EUR", "USD"], [7, "USD", "USD"]] as const) {
      expect(convertClient(a, f, t, rates)).toBe(convert(a, f, t, rates));
    }
    expect(convertClient(1, "USD", "GBP", rates)).toBeNull();
  });
});

describe("paidOnDebt", () => {
  const debt = { _id: "d1", currency: "ILS" };
  it("מסכם רק החזרים שקשורים לחוב הזה", () => {
    const all = [
      { kind: "payment", debtId: "d1", amount: 1000 },
      { kind: "payment", debtId: "d2", amount: 5000 },
      { kind: "debt", debtId: "d1", amount: 7000 },
      { kind: "payment", debtId: "d1", amount: 500 },
    ];
    expect(paidOnDebt(debt, all, null)).toBe(1500);
  });
  it("משתמש בשער ששמור בהחזר ולא בשער הנוכחי", () => {
    const all = [{ kind: "payment", debtId: "d1", amount: 100, currency: "USD", fx: { USD: 1, ILS: 3 } }];
    expect(paidOnDebt(debt, all, rates)).toBe(300);
  });
  it("החזר בלי שער מושמט ולא שובר את הסכום", () => {
    const all = [
      { kind: "payment", debtId: "d1", amount: 100, currency: "USD" },
      { kind: "payment", debtId: "d1", amount: 200 },
    ];
    expect(paidOnDebt(debt, all, null)).toBe(200);
  });
  it("חוב בלי currency הוא בשקלים", () => {
    const all = [{ kind: "payment", debtId: "d1", amount: 100, currency: "USD" }];
    expect(paidOnDebt({ _id: "d1" }, all, rates)).toBe(400);
  });
});

// הלוגיקה של entries.add: החזר מותר עד remaining * 1.02 + 1.
describe("מרווח ההחזר", () => {
  const allowed = (pay: number, remaining: number) => !(pay > remaining * 1.02 + 1);
  it("מרווח של 2% ועוד 1", () => {
    expect(allowed(10201, 10000)).toBe(true);
    expect(allowed(10202, 10000)).toBe(false);
    expect(allowed(1, 0.4)).toBe(true);
  });
});
