import { beforeEach, describe, expect, it } from "vitest";
import { debtStates, openDebtsOf, openDebts, pairOwes, setFx, totalsByCurrency } from "../src-react/lib/computations.js";
import { paidOnDebt } from "../convex/currency";

// A חייב ל-B. סכומים באגורות.
const A = "a", B = "b", C = "c";
let n = 0;
const mk = (kind: "debt" | "payment", amount: number, date: string, extra: Record<string, unknown> = {}) =>
  ({ id: `e${++n}`, kind, from: A, to: B, amount, currency: "ILS", date, createdAt: n, status: "approved", ...extra });
const debt = (amount: number, date: string, extra = {}) => mk("debt", amount, date, extra);
const pay = (amount: number, date: string, extra = {}) => mk("payment", amount, date, extra);

beforeEach(() => { n = 0; setFx("ILS", null); });

describe("חלוקת החזר כללי", () => {
  it("מכסה את החובות מהישן לחדש", () => {
    const d1 = debt(10000, "2026-01-01"), d2 = debt(5000, "2026-01-02");
    const entries = [d2, d1, pay(12000, "2026-01-03")]; // הסדר במערך לא משנה
    const st = debtStates(entries);
    expect(st.get(d1.id).remaining).toBe(0);
    expect(st.get(d2.id).remaining).toBe(3000);
    expect(pairOwes(A, B, entries)).toBe(3000);
  });

  it("החזר באותו יום נספר לפי סדר היצירה", () => {
    const d1 = debt(1000, "2026-01-01"), d2 = debt(1000, "2026-01-01");
    const st = debtStates([d2, d1, pay(1000, "2026-01-01")]);
    expect(st.get(d1.id).remaining).toBe(0);
    expect(st.get(d2.id).remaining).toBe(1000);
  });

  it("החזר מקושר הולך לחוב שלו גם כשיש חוב ישן יותר", () => {
    const old = debt(10000, "2026-01-01"), recent = debt(5000, "2026-01-02");
    const st = debtStates([old, recent, pay(5000, "2026-01-03", { debtId: recent.id })]);
    expect(st.get(recent.id).remaining).toBe(0);
    expect(st.get(old.id).remaining).toBe(10000);
  });

  it("החזר כללי מתחשב בהחזר מקושר שכבר כיסה חלק מהחוב", () => {
    const d1 = debt(10000, "2026-01-01"), d2 = debt(10000, "2026-01-02");
    const entries = [d1, d2, pay(4000, "2026-01-03", { debtId: d1.id }), pay(7000, "2026-01-04")];
    const st = debtStates(entries);
    expect(st.get(d1.id).remaining).toBe(0);
    expect(st.get(d2.id).remaining).toBe(9000);
  });

  it("החזר עודף הופך לזכות של המשלם", () => {
    const entries = [debt(1000, "2026-01-01"), pay(1500, "2026-01-02")];
    expect(pairOwes(A, B, entries)).toBe(-500);
    expect(pairOwes(B, A, entries)).toBe(500);
  });

  it("החזר מקושר שחורג מהחוב: העודף נשאר זכות ולא נעלם", () => {
    const d = debt(1000, "2026-01-01");
    expect(pairOwes(A, B, [d, pay(1400, "2026-01-02", { debtId: d.id })])).toBe(-400);
  });

  it("החזר לא נוגע בחובות בכיוון ההפוך או בין אנשים אחרים", () => {
    const reverse = { ...debt(3000, "2026-01-01"), from: B, to: A };
    const other = { ...debt(3000, "2026-01-01"), from: A, to: C };
    const entries = [reverse, other, pay(2000, "2026-01-02")];
    // ההחזר של A ל-B לא מכסה את החוב ההפוך של B ל-A. הוא עודף, ולכן B חייב ל-A עוד 2000.
    expect(debtStates(entries).get(reverse.id).remaining).toBe(3000);
    expect(pairOwes(B, A, entries)).toBe(3000 + 2000);
    expect(pairOwes(A, B, entries)).toBe(-5000);
    expect(pairOwes(A, C, entries)).toBe(3000);
  });

  it("רשומות ממתינות לאישור לא נספרות", () => {
    const entries = [debt(1000, "2026-01-01"), debt(9000, "2026-01-02", { status: "pending" }), pay(500, "2026-01-03", { status: "pending" })];
    expect(pairOwes(A, B, entries)).toBe(1000);
  });

  it("פחות מחצי אגורה שנשארה נחשב כשולם", () => {
    // 10000 ILS מול החזר של $27.77 לפי 3.6 => 9997.2 + 2.8 = קרוב; בודקים את הסף ישירות
    const d = debt(10000, "2026-01-01");
    const st = debtStates([d, pay(9999, "2026-01-02")]);
    expect(st.get(d.id).remaining).toBe(1); // אגורה אחת היא עדיין חוב
    const near = debtStates([d, pay(10000, "2026-01-02", { currency: "USD", fx: { ILS: 3.00003, USD: 1 } })]);
    expect(near.get(d.id).remaining).toBeLessThan(0.5);
    expect(near.get(d.id).remaining).toBe(0);
  });
});

describe("חלוקה בין מטבעות ועיגול", () => {
  const rates = { USD: 1, ILS: 4, EUR: 0.5 };

  it("החזר בשקלים על חוב בדולרים מומר לפי השער ששמור בהחזר, לא לפי השער היום", () => {
    setFx("ILS", { USD: 1, ILS: 2 }); // השער הנוכחי שונה
    const d = debt(10000, "2026-01-01", { currency: "USD" }); // $100
    const entries = [d, pay(20000, "2026-01-02", { fx: rates })]; // ₪200 לפי 4 = $50
    expect(debtStates(entries).get(d.id).remaining).toBe(5000);
    expect(totalsByCurrency(A, B, entries)).toEqual({ USD: 5000 });
  });

  it("החזר בדולרים על חוב בשקלים", () => {
    const d = debt(40000, "2026-01-01"); // ₪400
    const entries = [d, pay(2500, "2026-01-02", { currency: "USD", fx: rates })]; // $25 = ₪100
    expect(debtStates(entries).get(d.id).remaining).toBe(30000);
  });

  it("החזר גדול מהחוב במטבע אחר משאיר עודף במטבע ההחזר", () => {
    setFx("ILS", rates);
    const d = debt(1000, "2026-01-01", { currency: "USD" }); // $10 = ₪40
    const entries = [d, pay(5000, "2026-01-02", { fx: rates })]; // ₪50
    expect(debtStates(entries).get(d.id).remaining).toBe(0);
    expect(pairOwes(A, B, entries)).toBe(-1000); // עודף ₪10
  });

  it("חלוקה לשלושה: סכום ששולם + מה שנשאר = סכום החוב, בלי סחף", () => {
    const d = debt(10000, "2026-01-01", { currency: "USD" }); // $100 = ₪300 בשער 3
    const fx = { USD: 1, ILS: 3 };
    const third = [pay(3333, "2026-01-02", { fx }), pay(3333, "2026-01-03", { fx }), pay(3333, "2026-01-04", { fx })];
    const st = debtStates([d, ...third]).get(d.id);
    expect(st.paid + st.remaining).toBeCloseTo(10000, 6);
    expect(st.remaining).toBeCloseTo(6667, 6);
    expect(totalsByCurrency(A, B, [d, ...third])).toEqual({ USD: 6667 });
    // ההחזר האחרון סוגר בדיוק, בלי שארית של אגורה
    const done = debtStates([d, ...third, pay(20001, "2026-01-05", { fx })]).get(d.id);
    expect(done.remaining).toBe(0);
    expect(pairOwes(A, B, [d, ...third, pay(20001, "2026-01-05", { fx })])).toBe(0);
  });

  it("הרבה החזרים קטנים לא מצטברים לשגיאה של אגורה", () => {
    const d = debt(10000, "2026-01-01");
    const entries = [d, ...Array.from({ length: 100 }, (_, i) => pay(100, `2026-02-${String(1 + (i % 28)).padStart(2, "0")}`))];
    expect(debtStates(entries).get(d.id).remaining).toBe(0);
    expect(pairOwes(A, B, entries)).toBe(0);
  });

  it("חלוקה במטבע זר: totals מעוגל לשלם ולא שלילי", () => {
    const d = debt(10000, "2026-01-01", { currency: "USD" });
    const entries = [d, pay(1111, "2026-01-02", { fx: { USD: 1, ILS: 3.7 } })]; // 300.27 USD-cents
    const totals = totalsByCurrency(A, B, entries);
    expect(Number.isInteger(totals.USD)).toBe(true);
    expect(totals.USD).toBe(Math.round(10000 - 1111 / 3.7));
  });

  it("בלי שערים החזר במטבע אחר לא נספר ולא מפיל את החישוב", () => {
    const d = debt(10000, "2026-01-01", { currency: "USD" });
    const entries = [d, pay(500, "2026-01-02")];
    expect(debtStates(entries).get(d.id).remaining).toBe(10000);
    expect(() => pairOwes(A, B, entries)).not.toThrow();
  });

  it("אינווריאנט אקראי: paid + remaining = amount ושום יתרה לא שלילית", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const cur = ["ILS", "USD", "EUR"] as const;
    for (let round = 0; round < 50; round++) {
      const entries: any[] = [];
      for (let i = 0; i < 12; i++) {
        const day = `2026-03-${String(1 + i).padStart(2, "0")}`;
        const c = cur[Math.floor(rnd() * 3)];
        if (rnd() < 0.5) entries.push(debt(100 + Math.floor(rnd() * 20000), day, { currency: c }));
        else entries.push(pay(1 + Math.floor(rnd() * 15000), day, { currency: c, fx: rates }));
      }
      for (const st of debtStates(entries).values()) {
        expect(st.remaining).toBeGreaterThanOrEqual(0);
        expect(st.paid + st.remaining).toBeCloseTo(st.debt.amount, 6);
      }
    }
  });
});

describe("התאמה בין השרת ללקוח", () => {
  it("מה שנשאר מחוב מקושר זהה בשרת (paidOnDebt) ובלקוח", () => {
    const rates = { USD: 1, ILS: 3.7 };
    const d = debt(10000, "2026-01-01", { currency: "USD" });
    const pays = [pay(1111, "2026-01-02", { debtId: d.id, fx: rates }), pay(2500, "2026-01-03", { debtId: d.id, fx: rates })];
    const serverRemaining = d.amount - paidOnDebt({ _id: d.id, currency: "USD" }, pays.map((p) => ({ ...p, debtId: p.debtId })), rates);
    expect(debtStates([d, ...pays]).get(d.id).remaining).toBeCloseTo(serverRemaining, 6);
  });
});

describe("יתרות המשפחה", () => {
  it("openDebts ממיין לפי סכום ומציג חייב/זכאי נכון", () => {
    const people = [{ id: A }, { id: B }, { id: C }];
    const entries = [debt(3000, "2026-01-01"), { ...debt(8000, "2026-01-01"), from: C, to: A }];
    expect(openDebts(people, entries)).toEqual([
      { debtor: C, creditor: A, amount: 8000 },
      { debtor: A, creditor: B, amount: 3000 },
    ]);
  });

  it("openDebtsOf מחזיר רק חובות פתוחים עם יתרה מעוגלת", () => {
    const d1 = debt(1000, "2026-01-01"), d2 = debt(2000, "2026-01-02");
    const open = openDebtsOf(A, B, [d1, d2, pay(1000, "2026-01-03"), pay(500, "2026-01-04")]);
    expect(open.map((x: any) => [x.debt.id, x.remaining])).toEqual([[d2.id, 1500]]);
  });
});
