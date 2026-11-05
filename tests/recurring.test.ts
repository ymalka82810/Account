// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { addDays, jerusalemToday } from "../convex/lib";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }, { name: "רון", role: "teen" }], "ILS");
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "נועם", role: "child" }]);
});

const weekly = (token: string, extra: object = {}) => ({
  token, from: A.ids["אבא"], to: A.ids["דנה"], amount: 1000, note: "", frequency: "weekly" as const, weekday: 5, ...extra,
});
const recurringOf = (familyId: any) =>
  t.run((ctx) => ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect());
const entriesOf = (familyId: any) =>
  t.run((ctx) => ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect());
// רישום קבוע ישירות במסד, עם תאריך הבא שנבחר בבדיקה
const insertRecurring = (nextDate: string, extra: object = {}) =>
  t.run((ctx) => ctx.db.insert("recurring", {
    familyId: A.familyId, from: A.ids["אבא"], to: A.ids["דנה"], amount: 500, note: "דמי כיס", currency: "ILS",
    frequency: "weekly", weekday: 0, nextDate, createdBy: A.ids["אבא"], createdAt: Date.now(), ...extra,
  } as any));

describe("הוספת רישום קבוע", () => {
  it("הורה מוסיף רישום שבועי; ההערה הריקה הופכת ל'דמי כיס' והתאריך הבא בעתיד", async () => {
    await t.mutation(api.recurring.add, weekly(A.tokens["אבא"]));
    const [r] = await recurringOf(A.familyId);
    expect(r.note).toBe("דמי כיס");
    expect(r.currency).toBe("ILS");
    expect(r.nextDate > jerusalemToday()).toBe(true);
    expect(r.monthDay).toBeUndefined();
  });

  it("רישום חודשי שומר רק את היום בחודש", async () => {
    await t.mutation(api.recurring.add, weekly(A.tokens["אבא"], { frequency: "monthly", weekday: 3, monthDay: 10 }));
    const [r] = await recurringOf(A.familyId);
    expect(r.monthDay).toBe(10);
    expect(r.weekday).toBeUndefined();
    expect(r.nextDate.endsWith("-10")).toBe(true);
  });

  it("ילד ונער לא יכולים להוסיף רישום קבוע", async () => {
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["דנה"]))).rejects.toThrow();
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["רון"]))).rejects.toThrow();
    expect(await recurringOf(A.familyId)).toHaveLength(0);
  });

  it("אי אפשר לרשום על אדם ממשפחה אחרת", async () => {
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["אבא"], { to: B.ids["נועם"] }))).rejects.toThrow();
    expect(await recurringOf(A.familyId)).toHaveLength(0);
  });

  it.each([
    [{ amount: 0 }, "סכום לא תקין"],
    [{ amount: -5 }, "סכום לא תקין"],
    [{ amount: 10.5 }, "סכום לא תקין"],
    [{ amount: 1_000_001 }, "סכום לא תקין"],
    [{ note: "א".repeat(81) }, "ההערה ארוכה מדי"],
    [{ weekday: 7 }, "יום לא תקין"],
    [{ weekday: undefined }, "יום לא תקין"],
    [{ frequency: "monthly", monthDay: 29 }, "יום בחודש לא תקין"],
    [{ frequency: "monthly", monthDay: 0 }, "יום בחודש לא תקין"],
  ])("ערכים לא תקינים נדחים: %o", async (extra, msg) => {
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["אבא"], extra))).rejects.toThrow(msg);
  });

  it("אדם לא יכול להיות חייב לעצמו", async () => {
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["אבא"], { to: A.ids["אבא"] }))).rejects.toThrow("לעצמו");
  });

  it("עד 30 רישומים קבועים למשפחה", async () => {
    for (let i = 0; i < 30; i++) await t.mutation(api.recurring.add, weekly(A.tokens["אבא"]));
    await expect(t.mutation(api.recurring.add, weekly(A.tokens["אבא"]))).rejects.toThrow("הרבה רישומים");
  });
});

describe("מחיקת רישום קבוע", () => {
  it("הורה מוחק רישום של המשפחה שלו", async () => {
    const id = await t.mutation(api.recurring.add, weekly(A.tokens["אבא"]));
    await t.mutation(api.recurring.remove, { token: A.tokens["אבא"], id });
    expect(await recurringOf(A.familyId)).toHaveLength(0);
  });
  it("הורה ממשפחה אחרת לא מוחק (ובלי שגיאה שחושפת מידע)", async () => {
    const id = await t.mutation(api.recurring.add, weekly(A.tokens["אבא"]));
    await t.mutation(api.recurring.remove, { token: B.tokens["אמא"], id });
    expect(await recurringOf(A.familyId)).toHaveLength(1);
  });
  it("ילד לא מוחק", async () => {
    const id = await t.mutation(api.recurring.add, weekly(A.tokens["אבא"]));
    await expect(t.mutation(api.recurring.remove, { token: A.tokens["דנה"], id })).rejects.toThrow();
    expect(await recurringOf(A.familyId)).toHaveLength(1);
  });
});

describe("הריצה היומית (runDue)", () => {
  it("רישום שהגיע זמנו יוצר חוב ומקדם את התאריך הבא לעתיד", async () => {
    const today = jerusalemToday();
    const id = await insertRecurring(today);
    await t.mutation(internal.recurring.runDue, {});
    const entries = await entriesOf(A.familyId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "debt", amount: 500, date: today, note: "דמי כיס", currency: "ILS" });
    const r = await t.run((ctx) => ctx.db.get(id));
    expect(r!.nextDate).toBe(addDays(today, 7));
  });

  it("רישום עתידי לא יוצר כלום", async () => {
    await insertRecurring(addDays(jerusalemToday(), 3));
    await t.mutation(internal.recurring.runDue, {});
    expect(await entriesOf(A.familyId)).toHaveLength(0);
  });

  it("משלים פעמים שהוחמצו (3 שבועות = 3 חובות)", async () => {
    await insertRecurring(addDays(jerusalemToday(), -14));
    await t.mutation(internal.recurring.runDue, {});
    expect(await entriesOf(A.familyId)).toHaveLength(3);
  });

  it("לא מציף: לכל היותר 8 השלמות, והתאריך הבא בכל זאת בעתיד", async () => {
    const id = await insertRecurring(addDays(jerusalemToday(), -7 * 20));
    await t.mutation(internal.recurring.runDue, {});
    expect(await entriesOf(A.familyId)).toHaveLength(8);
    const r = await t.run((ctx) => ctx.db.get(id));
    expect(r!.nextDate > jerusalemToday()).toBe(true);
  });

  it("ריצה כפולה באותו יום לא יוצרת חוב כפול", async () => {
    await insertRecurring(jerusalemToday());
    await t.mutation(internal.recurring.runDue, {});
    await t.mutation(internal.recurring.runDue, {});
    expect(await entriesOf(A.familyId)).toHaveLength(1);
  });

  it("רישום של אדם שנמחק נמחק בעצמו בלי ליצור חוב", async () => {
    const id = await insertRecurring(jerusalemToday());
    await t.run((ctx) => ctx.db.delete(A.ids["דנה"]));
    await t.mutation(internal.recurring.runDue, {});
    expect(await entriesOf(A.familyId)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  });

  it("רישום ישן בלי מטבע נרשם בשקלים", async () => {
    await insertRecurring(jerusalemToday(), { currency: undefined });
    await t.mutation(internal.recurring.runDue, {});
    const [e] = await entriesOf(A.familyId);
    expect(e.currency).toBe("ILS");
  });
});
