// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { debtStates, pairOwes, setFx } from "../src-react/lib/computations.js";
import { isSettled } from "../convex/ledger";

// isSettled (שרת) ו-ledger() (לקוח) הן שתי כתיבות של אותה חלוקת החזרים. אם הן יתפצלו, ארכוב
// יסגור זוג שהלקוח עדיין רואה בו יתרה (או להפך) ויתרות ישתנו בשקט. כאן מריצים את שתיהן על אותם נתונים.

const A = "a", B = "b";
const RATES = { USD: 1, ILS: 3.7, EUR: 0.9 };

type Raw = { id: string; kind: "debt" | "payment"; amount: number; currency: string; date: string; createdAt: number; debtId?: string; fx?: typeof RATES };

const toClient = (e: Raw) => ({ ...e, from: A, to: B, status: "approved", fx: e.fx ?? null, debtId: e.debtId ?? null });
const toServer = (e: Raw) => ({ ...e, _id: e.id, _creationTime: e.createdAt, from: A, to: B, status: "approved", fx: e.fx, debtId: e.debtId }) as any;

// הלקוח סגור כשאין חוב עם יתרה ואין החזר עודף (leftover) - pairOwes מחזיר 0 רק בלי שניהם.
const clientSettled = (raw: Raw[]) => {
  const entries = raw.map(toClient);
  const open = [...debtStates(entries).values()].some((st: any) => st.remaining > 0);
  return !open && pairOwes(A, B, entries, "ILS") === 0 && pairOwes(B, A, entries, "ILS") === 0;
};

beforeEach(() => setFx("ILS", RATES));

describe("התאמה בין isSettled בשרת ל-ledger בלקוח", () => {
  it("אותה תשובה על תרחישים אקראיים", () => {
    let seed = 987654;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const cur = ["ILS", "USD", "EUR"];
    let settled = 0, notSettled = 0;
    for (let round = 0; round < 5000; round++) {
      const raw: Raw[] = [];
      const debtIds: string[] = [];
      const count = 1 + rnd(6);
      for (let i = 0; i < count; i++) {
        const base = { id: `e${i}`, currency: cur[rnd(3)], date: `2026-01-${String(1 + rnd(5)).padStart(2, "0")}`, createdAt: i + 1 };
        if (rnd(10) < 4 || !debtIds.length) {
          raw.push({ ...base, kind: "debt", amount: (1 + rnd(5)) * 1000 });
          debtIds.push(base.id);
        } else {
          // סכומים עגולים כדי שסגירה מלאה תקרה בתדירות סבירה, ועם שער שמור או בלעדיו
          raw.push({
            ...base, kind: "payment", amount: (1 + rnd(8)) * 500,
            ...(rnd(2) ? { debtId: debtIds[rnd(debtIds.length)] } : {}),
            ...(rnd(2) ? { fx: RATES } : {}),
          });
        }
      }
      if (rnd(2)) {
        // ניסיון סגירה: החזר מקושר לכל חוב (בערך הסכום שלו, לפעמים פחות או יותר), כדי ששני הצדדים יראו גם מקרים סגורים
        for (const d of raw.filter((e) => e.kind === "debt")) {
          const delta = (rnd(4) - 1) * 500; // -500, 0, 500, 1000
          raw.push({ id: `c${d.id}`, kind: "payment", amount: Math.max(1, d.amount + delta), currency: d.currency, date: "2026-02-01", createdAt: 100 + raw.length, debtId: d.id });
        }
      }
      const server = isSettled(raw.map(toServer), RATES);
      const client = clientSettled(raw);
      expect(server, JSON.stringify(raw)).toBe(client);
      server ? settled++ : notSettled++;
    }
    // בלי שני הצדדים התרחישים לא בודקים כלום
    expect(settled).toBeGreaterThan(10);
    expect(notSettled).toBeGreaterThan(20);
  });

  it("חוב ששולם בדיוק: שניהם סגורים; עודף: שניהם פתוחים", () => {
    const d: Raw = { id: "d", kind: "debt", amount: 1000, currency: "ILS", date: "2026-01-01", createdAt: 1 };
    const exact: Raw = { id: "p", kind: "payment", amount: 1000, currency: "ILS", date: "2026-01-02", createdAt: 2 };
    const over: Raw = { ...exact, amount: 1500 };
    expect(isSettled([d, exact].map(toServer), RATES)).toBe(true);
    expect(clientSettled([d, exact])).toBe(true);
    expect(isSettled([d, over].map(toServer), RATES)).toBe(false);
    expect(clientSettled([d, over])).toBe(false);
  });
});
