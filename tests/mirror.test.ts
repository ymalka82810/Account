import { beforeEach, describe, expect, test, vi } from "vitest";
// @ts-ignore - מודולי JS של הפרונטאנד
import { setFx, debtStates, pairOwes, openDebtsOf, debtRateNote, rateText } from "../src-react/lib/computations.js";
// @ts-ignore
import { buildMirror } from "../src-react/lib/mirror.js";

// הפנקס שומר ב-localStorage; בסביבת הבדיקה אין דפדפן, אז מדמים את המינימום (כמו ב-notebook-offset.test.ts).
(globalThis as any).window = globalThis;
if (!(globalThis as any).navigator) (globalThis as any).navigator = { languages: ["he-IL"], language: "he-IL", onLine: true };
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const ME = "me", DAD = "dad", SIS = "sis";
const names: Record<string, string> = { [DAD]: "אבא", [SIS]: "נועה" };
const nameOf = (id: string) => names[id] ?? "?";
let n = 0;
const mk = (kind: string, from: string, to: string, amount: number, extra: Record<string, unknown> = {}) =>
  ({ id: `e${++n}`, kind, from, to, amount, currency: "ILS", note: "", date: "2026-11-01", createdAt: n, status: "approved", ...extra });

beforeEach(() => { n = 0; setFx("ILS", { USD: 1, ILS: 4 }); });

describe("העתקת חובות המשפחה לפנקס (buildMirror)", () => {
  test("כל חוב שלי מועתק על אותו שם, סכום ותיאור, בכיוון הנכון", () => {
    const entries = [
      mk("debt", ME, DAD, 5000, { note: "גלידה" }),
      mk("debt", SIS, ME, 2000, { note: "ספר", date: "2026-11-03" }),
    ];
    expect(buildMirror({ me: ME, entries, nameOf })).toEqual([
      { id: "m:e2", dir: "owed", name: "נועה", amount: 2000, total: 2000, currency: "ILS", note: "ספר", date: "2026-11-03", paid: false },
      { id: "m:e1", dir: "iowe", name: "אבא", amount: 5000, total: 5000, currency: "ILS", note: "גלידה", date: "2026-11-01", paid: false },
    ]);
  });

  test("חובות של אחרים (הורה רואה את כל המשפחה), רשומות שממתינות לאישור והחזרים לא מועתקים", () => {
    const entries = [
      mk("debt", SIS, DAD, 9000),
      mk("debt", ME, DAD, 1000, { status: "pending" }),
      mk("payment", ME, DAD, 300),
    ];
    expect(buildMirror({ me: ME, entries, nameOf })).toEqual([]);
  });

  test("חוב ששולם חלקית מועתק בסכום שנשאר; חוב שנסגר (מהשרת) מועתק כשולם בסכום המלא", () => {
    const d = mk("debt", ME, DAD, 5000);
    const entries = [d, mk("payment", ME, DAD, 2000, { debtId: d.id })];
    const closed = [{ id: "old1", from: DAD, to: ME, amount: 700, note: "דמי כיס", currency: "ILS", date: "2026-10-01" }];
    const out = buildMirror({ me: ME, entries, closed, nameOf });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "m:e1", amount: 3000, total: 5000, paid: false });
    expect(out[1]).toMatchObject({ id: "m:old1", dir: "owed", name: "אבא", amount: 700, paid: true, note: "דמי כיס" });
  });

  test("חוב במטבע זר נשאר במטבע שלו; לפי שער יום ההלוואה נשמרים בו השערים", () => {
    const loan = mk("debt", ME, DAD, 10000, { currency: "USD", rateAt: "loan", fx: { USD: 1, ILS: 3 } });
    const float = mk("debt", ME, DAD, 10000, { currency: "USD", rateAt: "payment", fx: { USD: 1, ILS: 3 } });
    const out = buildMirror({ me: ME, entries: [loan, float], nameOf });
    expect(out.find((e: any) => e.id === "m:e1")).toMatchObject({ currency: "USD", amount: 10000, fx: { USD: 1, ILS: 3 } });
    expect(out.find((e: any) => e.id === "m:e2").fx).toBeUndefined();
  });
});

describe("חוב במטבע זר: שער יום ההלוואה או יום ההחזר (לקוח)", () => {
  const loanFx = { USD: 1, ILS: 3 };
  test("לפי שער יום ההלוואה: השווי וההחזר לפי השער שנשמר בחוב, גם כשהשער היום שונה", () => {
    const d = mk("debt", ME, DAD, 10000, { currency: "USD", rateAt: "loan", fx: loanFx }); // $100 = ₪300 ביום ההלוואה
    expect(pairOwes(ME, DAD, [d])).toBe(30000); // ולא ₪400 לפי שער היום
    const x = openDebtsOf(ME, DAD, [d])[0];
    expect(x).toMatchObject({ value: 30000, loanRate: true, foreign: true });
    // ₪150 משלמים חצי מהחוב, למרות שההחזר נושא את שערי היום (4)
    const p = mk("payment", ME, DAD, 15000, { debtId: d.id, fx: { USD: 1, ILS: 4 } });
    expect(debtStates([d, p]).get(d.id).remaining).toBe(5000);
  });

  test("לפי שער יום ההחזר: כמו קודם, לפי השער שבהחזר והשווי לפי שער היום", () => {
    const d = mk("debt", ME, DAD, 10000, { currency: "USD", rateAt: "payment", fx: loanFx });
    expect(pairOwes(ME, DAD, [d])).toBe(40000);
    expect(openDebtsOf(ME, DAD, [d])[0].loanRate).toBe(false);
    const p = mk("payment", ME, DAD, 20000, { debtId: d.id, fx: { USD: 1, ILS: 4 } });
    expect(debtStates([d, p]).get(d.id).remaining).toBe(5000);
  });

  test("על החוב כתוב השער של יום הרישום ולפי איזה שער הוא מוחזר", () => {
    const d = mk("debt", ME, DAD, 10000, { currency: "USD", rateAt: "loan", fx: loanFx });
    expect(rateText("USD", "ILS", loanFx)).toContain("3.00");
    // שפת הבדיקה היא ברירת המחדל (אנגלית), אז בודקים את השער ואת ההבדל בין שתי הבחירות ולא נוסח מסוים
    const loan = debtRateNote(d, "ILS");
    const float = debtRateNote({ ...d, rateAt: "payment" }, "ILS");
    expect(loan).toContain("3.00");
    expect(float).toContain("3.00");
    expect(loan).not.toBe(float);
    expect(debtRateNote(mk("debt", ME, DAD, 100), "ILS")).toBe("");
  });
});

describe("ההעתק בפנקס (notebook.js)", () => {
  let nb: any;
  beforeEach(async () => {
    store.clear();
    vi.resetModules();
    // @ts-ignore
    nb = await import("../src-react/lib/notebook.js");
  });
  const saved = () => JSON.parse(store.get(nb.NOTEBOOK_KEY)!);
  const group = (entries: any[], kind = "family") => ({ kind, person: ME, label: "משפחת כהן", entries });
  const one = { id: "m:1", dir: "iowe", name: "אבא", amount: 500, total: 500, currency: "ILS", note: "", date: "2026-11-01", paid: false };

  test("ההעתק נשמר בנפרד מרישומי הפנקס: לא נשלח להורים, לא נמחק עם הפנקס ולא נכנס לשמות הידועים", () => {
    nb.addEntry({ dir: "owed", name: "שכן", amount: 100, note: "", date: "2026-11-02" });
    nb.setMirror("fam:f1", group([one]));
    expect(saved().entries).toHaveLength(1);
    expect(saved().people.map((p: any) => p.name)).toEqual(["שכן"]);
    expect(nb.mirrorEntries()).toEqual([{ ...one, src: "family", label: "משפחת כהן" }]);
    nb.clearAll();
    expect(saved().entries).toEqual([]);
    expect(nb.mirrorEntries()).toHaveLength(1);
  });

  test("כל מקור מוחלף בשלמותו (החוב נעלם מהמשפחה = נעלם מהפנקס), ומשפחה אחרת לא מושפעת", () => {
    nb.setMirror("fam:f1", group([one]));
    nb.setMirror("fam:f2", group([{ ...one, id: "m:2" }]));
    nb.setMirror("fr:f1", group([{ ...one, id: "m:3" }], "friends"));
    nb.setMirror("fam:f1", group([]));
    expect(nb.mirrorEntries().map((e: any) => [e.id, e.src])).toEqual([["m:2", "family"], ["m:3", "friends"]]);
    nb.dropFamilyMirror("f1");
    expect(nb.mirrorEntries().map((e: any) => e.id)).toEqual(["m:2"]);
  });

  test("אותו תוכן לא נכתב שוב (בלי רינדור ובלי שליחה מיותרת)", () => {
    nb.setMirror("fam:f1", group([one]));
    const before = nb.useNotebook; // רק כדי לוודא שהמודול נטען
    expect(before).toBeTypeOf("function");
    const raw = store.get(nb.NOTEBOOK_KEY);
    let writes = 0;
    const orig = (globalThis as any).localStorage.setItem;
    (globalThis as any).localStorage.setItem = (k: string, v: string) => { writes++; orig(k, v); };
    nb.setMirror("fam:f1", group([{ ...one }]));
    nb.setMirrorRates({ USD: 1, ILS: 4 });
    nb.setMirrorRates({ USD: 1, ILS: 4 });
    (globalThis as any).localStorage.setItem = orig;
    expect(writes).toBe(1);
    expect(store.get(nb.NOTEBOOK_KEY)).not.toBe(raw);
  });

  test("פנקס שנשמר לפני החיבור (בלי mirror) נטען תקין, והעתק נשאר אחרי טעינה מחדש", async () => {
    store.set(nb.NOTEBOOK_KEY, JSON.stringify({ entries: [], people: [] }));
    vi.resetModules();
    // @ts-ignore
    nb = await import("../src-react/lib/notebook.js");
    expect(nb.mirrorEntries()).toEqual([]);
    nb.setMirror("fam:f1", group([one]));
    vi.resetModules();
    // @ts-ignore
    nb = await import("../src-react/lib/notebook.js");
    expect(nb.mirrorEntries()).toHaveLength(1);
  });
});
