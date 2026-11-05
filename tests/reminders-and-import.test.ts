// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { addDays, jerusalemToday } from "../convex/lib";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "גיל", role: "child" }], "ILS");
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "נועם", role: "child" }]);
});
afterEach(() => { vi.unstubAllEnvs(); });

const entry = (kind: "debt" | "payment", from: any, to: any, amount: number, date: string, extra: object = {}) =>
  t.run((ctx) => ctx.db.insert("entries", {
    familyId: A.familyId, kind, from, to, amount, note: "", date, currency: "ILS", createdBy: A.ids["אבא"], createdAt: 0, ...extra,
  } as any));
const withPush = async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  await t.run((ctx) => ctx.db.insert("pushSubs", {
    personId: A.ids["אבא"], familyId: A.familyId, endpoint: "https://push/x", p256dh: "k", auth: "a", createdAt: 0,
  }));
};
// ההתראות שתוזמנו (pushSend.send)
const scheduledPushes = () => t.run(async (ctx) =>
  (await ctx.db.system.query("_scheduled_functions").collect()).filter((f: any) => f.name.includes("pushSend")).map((f: any) => f.args[0]));

describe("תזכורת שבועית על חובות ישנים", () => {
  it("חוב פתוח שלא זז שבועיים שולח תזכורת להורה", async () => {
    await withPush();
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, addDays(jerusalemToday(), -20));
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    const pushes = await scheduledPushes();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].body).toContain("דנה");
    expect(pushes[0].body).toContain("₪50");
  });

  it("חוב חדש (פחות משבועיים) לא שולח", async () => {
    await withPush();
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, addDays(jerusalemToday(), -3));
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    expect(await scheduledPushes()).toHaveLength(0);
  });

  it("חוב שהוחזר במלואו לא שולח", async () => {
    await withPush();
    const old = addDays(jerusalemToday(), -30);
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, old);
    await entry("payment", A.ids["דנה"], A.ids["אבא"], 5000, old);
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    expect(await scheduledPushes()).toHaveLength(0);
  });

  it("חוב קטן משקל אחד לא שולח", async () => {
    await withPush();
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 99, addDays(jerusalemToday(), -30));
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    expect(await scheduledPushes()).toHaveLength(0);
  });

  it("רשומה ממתינה לאישור לא נספרת", async () => {
    await withPush();
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, addDays(jerusalemToday(), -30), { status: "pending" });
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    expect(await scheduledPushes()).toHaveLength(0);
  });

  it("כמה חובות ישנים מסוכמים להודעה אחת", async () => {
    await withPush();
    const old = addDays(jerusalemToday(), -30);
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, old);
    await entry("debt", A.ids["גיל"], A.ids["אבא"], 2000, old);
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    const [p] = await scheduledPushes();
    expect(p.body).toContain("2");
    expect(p.body).toContain("₪70");
  });

  it("בלי מפתחות התראה בשרת לא נשלח כלום (וגם לא קורס)", async () => {
    await t.run((ctx) => ctx.db.insert("pushSubs", {
      personId: A.ids["אבא"], familyId: A.familyId, endpoint: "e", p256dh: "k", auth: "a", createdAt: 0,
    }));
    await entry("debt", A.ids["דנה"], A.ids["אבא"], 5000, addDays(jerusalemToday(), -30));
    await t.mutation(internal.reminders.forFamily, { familyId: A.familyId });
    expect(await scheduledPushes()).toHaveLength(0);
  });

  it("weekly מתזמן בדיקה רק למשפחות עם מכשיר רשום", async () => {
    await withPush();
    await t.mutation(internal.reminders.weekly, {});
    const jobs = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f: any) => f.args[0]));
    expect(jobs).toEqual([{ familyId: A.familyId }]);
  });
});

describe("ייבוא נתונים (admin.importData)", () => {
  const file = {
    people: [{ id: "p1", name: "דנה", role: "child" as const }, { id: "p2", name: "אבא", role: "parent" as const }, { id: "p3", name: "חדש", role: "child" as const }],
    entries: [
      { kind: "debt" as const, from: "p1", to: "p2", amount: 1000, date: "2025-05-01" },
      { kind: "payment" as const, from: "p3", to: "p2", amount: 200, date: "2025-05-02", note: "x".repeat(200) },
      { kind: "debt" as const, from: "p1", to: "p1", amount: 100, date: "2025-05-01" }, // לעצמו
      { kind: "debt" as const, from: "p1", to: "zz", amount: 100, date: "2025-05-01" }, // אדם לא קיים
      { kind: "debt" as const, from: "p1", to: "p2", amount: -5, date: "2025-05-01" }, // סכום שלילי
      { kind: "debt" as const, from: "p1", to: "p2", amount: 100, date: "1.5.2025" }, // תאריך לא תקין
    ],
  };

  it("מייבא רק רשומות תקינות, מתאים שמות קיימים ויוצר חדשים", async () => {
    const res = await t.mutation(api.admin.importData, { token: A.tokens["אבא"], ...file });
    expect(res).toEqual({ added: 2 });
    const people = await t.run((ctx) => ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", A.familyId)).collect());
    expect(people.map((p) => p.name).sort()).toEqual(["אבא", "גיל", "דנה", "חדש"].sort());
    const entries = await t.run((ctx) => ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", A.familyId)).collect());
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.kind === "payment")!.note).toHaveLength(80);
  });

  it("ילד לא יכול לייבא", async () => {
    await expect(t.mutation(api.admin.importData, { token: A.tokens["דנה"], ...file })).rejects.toThrow();
  });

  it("ייבוא לא משפיע על משפחה אחרת", async () => {
    await t.mutation(api.admin.importData, { token: A.tokens["אבא"], ...file });
    const bEntries = await t.run((ctx) => ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", B.familyId)).collect());
    expect(bEntries).toHaveLength(0);
  });

  it("קובץ גדול מדי נדחה", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: "x" + i, name: "ש" + i, role: "child" as const }));
    await expect(t.mutation(api.admin.importData, { token: A.tokens["אבא"], people: many, entries: [] })).rejects.toThrow("גדול מדי");
  });
});

describe("שערי חליפין (fx)", () => {
  it("store יוצר מסמך אחד ומעדכן אותו (לא מוסיף עוד)", async () => {
    await t.mutation(internal.fx.store, { rates: { USD: 1, ILS: 3.7 }, source: "a" });
    await t.mutation(internal.fx.store, { rates: { USD: 1, ILS: 3.6 }, source: "b" });
    const docs = await t.run((ctx) => ctx.db.query("fxRates").collect());
    expect(docs).toHaveLength(1);
    expect(docs[0].rates.ILS).toBe(3.6);
    const r = await t.query(api.fx.rates, {});
    expect(r!.rates.ILS).toBe(3.6);
  });

  it("בלי שערים rates מחזיר null", async () => {
    expect(await t.query(api.fx.rates, {})).toBeNull();
  });

  it("ensure לא פונה לרשת כשהשערים טריים", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await t.mutation(internal.fx.store, { rates: { USD: 1, ILS: 3.7, EUR: 0.9 }, source: "a" });
    await t.action(api.fx.ensure, {});
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refresh שומר רק מטבעות מוכרים, ונופל לספק הגיבוי כשהראשון נכשל", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("open.er-api")) return new Response("down", { status: 500 });
      return new Response(JSON.stringify({ rates: { ILS: 3.7, EUR: 0.9, XXX: 5, GBP: -1 } }));
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await t.action(internal.fx.refresh, {});
    const [doc] = await t.run((ctx) => ctx.db.query("fxRates").collect());
    expect(doc.source).toBe("frankfurter.app");
    expect(doc.rates).toEqual({ USD: 1, ILS: 3.7, EUR: 0.9 });
    vi.unstubAllGlobals();
  });

  it("refresh לא שומר כשמתקבלים מעט מדי שערים", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: "success", rates: { ILS: 3.7 } }))));
    await expect(t.action(internal.fx.refresh, {})).rejects.toThrow("too few");
    expect(await t.run((ctx) => ctx.db.query("fxRates").collect())).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
