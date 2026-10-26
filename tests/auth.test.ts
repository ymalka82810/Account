// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { LOCK_STEPS_MS, MAX_FAILS } from "../convex/lib";
import { familyCode, newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;
const CODE_A = familyCode("A");

const login = (personId: any, pin: string, device?: string, code = CODE_A) =>
  t.mutation(api.auth.login, { code, personId, pin, device });
const person = (id: any) => t.run((ctx) => ctx.db.get(id));
// מדלגים על זמן הנעילה כדי לנסות שוב.
const expireLock = (id: any) => t.run(async (ctx) => { await ctx.db.patch(id, { lockedUntil: Date.now() - 1 }); });

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent", pin: "1111" }, { name: "דנה", role: "child", pin: "2222" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent", pin: "3333" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

describe("כניסה", () => {
  it("קוד נכון נותן טוקן שעובד, וקוד שגוי לא", async () => {
    const ok: any = await login(A.ids["דנה"], "2222", "dev1");
    expect(ok.ok).toBe(true);
    expect(await t.query(api.data.get, { token: ok.token })).not.toBeNull();
    const bad: any = await login(A.ids["דנה"], "0000", "dev2");
    expect(bad).toMatchObject({ ok: false, reason: "wrong" });
  });

  it("קוד משפחה של משפחה אחרת, או קוד חסר, לא מאפשרים כניסה", async () => {
    expect(await login(A.ids["דנה"], "2222", "d", familyCode("B"))).toMatchObject({ ok: false, reason: "code" });
    expect(await login(A.ids["אבא"], "1111", "d", "ZZZZZZZZZZ")).toMatchObject({ ok: false, reason: "code" });
    const noCode: any = await t.mutation(api.auth.login, { personId: A.ids["דנה"], pin: "2222", device: "d" });
    expect(noCode).toMatchObject({ ok: false, reason: "code" });
  });

  it("אדם בלי קוד סודי לא נכנס", async () => {
    const p = await t.run(async (ctx) => {
      const fam = (await ctx.db.get(A.ids["דנה"]))!.familyId!;
      return await ctx.db.insert("people", { familyId: fam, name: "גיל", role: "child" });
    });
    expect(await login(p, "1234", "d")).toMatchObject({ ok: false, reason: "nopin" });
  });

  it("ניחושי קוד משפחה שגויים מוגבלים לפי מכשיר ולא חוסמים מכשיר אחר", async () => {
    for (let i = 0; i < 30; i++) await login(A.ids["דנה"], "2222", "attacker", "WRONGCODE1");
    expect(await login(A.ids["דנה"], "2222", "attacker")).toMatchObject({ ok: false, reason: "throttled" });
    expect(await login(A.ids["דנה"], "2222", "honest")).toMatchObject({ ok: true });
  });
});

describe("נעילה מדורגת (מכשיר מהימן)", () => {
  const trust = async (id: any, pin: string, device: string) => { expect(await login(id, pin, device)).toMatchObject({ ok: true }); };

  it("אחרי 5 כשלונות ממכשיר מהימן הקוד ננעל לדקה, גם לקוד הנכון", async () => {
    const id = A.ids["דנה"];
    await trust(id, "2222", "mine");
    for (let i = 1; i < MAX_FAILS; i++) {
      expect(await login(id, "0000", "mine")).toMatchObject({ ok: false, reason: "wrong", left: MAX_FAILS - i });
    }
    expect(await login(id, "0000", "mine")).toMatchObject({ ok: false, reason: "locked", waitSeconds: 60 });
    expect(await login(id, "2222", "mine")).toMatchObject({ ok: false, reason: "locked" });
    const p: any = await person(id);
    expect(p.lockLevel).toBe(1);
    expect(p.lockCount).toBe(1);
    expect(p.lastLockAt).toBeTypeOf("number");
  });

  it("כל נעילה ארוכה מהקודמת, עד המקסימום של יממה", async () => {
    const id = A.ids["דנה"];
    await trust(id, "2222", "mine");
    const waits: number[] = [];
    for (let level = 0; level < LOCK_STEPS_MS.length + 1; level++) {
      let r: any;
      for (let i = 0; i < MAX_FAILS; i++) r = await login(id, "0000", "mine");
      waits.push(r.waitSeconds);
      await expireLock(id);
    }
    expect(waits).toEqual([60, 300, 3600, 21600, 86400, 86400]);
  });

  it("כניסה מוצלחת מאפסת את הרמה, אבל נשמרת ספירת הנעילות להתראת ההורה", async () => {
    const id = A.ids["דנה"];
    await trust(id, "2222", "mine");
    for (let i = 0; i < MAX_FAILS; i++) await login(id, "0000", "mine");
    await expireLock(id);
    await trust(id, "2222", "mine");
    const p: any = await person(id);
    expect(p).toMatchObject({ lockLevel: 0, failedAttempts: 0, lockCount: 1 });
    const data: any = await t.query(api.data.get, { token: A.tokens["אבא"] });
    expect(data.people.find((x: any) => x.id === id).lockAlert).toMatchObject({ count: 1 });
  });

  it("כשלון בודד לא נועל, וכניסה מוצלחת מאפסת את מונה הכשלונות", async () => {
    const id = A.ids["דנה"];
    await trust(id, "2222", "mine");
    for (let i = 0; i < MAX_FAILS - 1; i++) await login(id, "0000", "mine");
    await trust(id, "2222", "mine");
    expect(await login(id, "0000", "mine")).toMatchObject({ ok: false, reason: "wrong", left: MAX_FAILS - 1 });
  });

  it("ילד לא רואה התראות נעילה, רק הורה", async () => {
    const id = A.ids["דנה"];
    await trust(id, "2222", "mine");
    for (let i = 0; i < MAX_FAILS; i++) await login(id, "0000", "mine");
    await expireLock(id);
    const asChild: any = await t.query(api.data.get, { token: (await login(id, "2222", "mine") as any).token });
    expect(asChild.people.every((x: any) => x.lockAlert === null)).toBe(true);
  });
});

describe("ניחושים ממכשיר זר", () => {
  it("מחזיק קוד משפחה לא יכול לנעול את האדם, רק את המכשיר שלו", async () => {
    const id = A.ids["דנה"];
    await login(id, "2222", "mine"); // המכשיר המהימן של הילד
    const results: any[] = [];
    for (let i = 0; i < 5; i++) results.push(await login(id, "0000", "stranger"));
    expect(results.map((r) => r.reason)).toEqual(["wrong", "wrong", "wrong", "wrong", "locked"]);
    expect(await login(id, "0000", "stranger")).toMatchObject({ reason: "locked" });
    // המכשיר הזר חסום גם עם הקוד הנכון, אבל הילד עצמו נכנס ללא בעיה
    expect(await login(id, "2222", "stranger")).toMatchObject({ ok: false, reason: "locked" });
    expect(await login(id, "2222", "mine")).toMatchObject({ ok: true });
    const p: any = await person(id);
    expect(p.lockedUntil).toBeUndefined();
    expect(p.lockCount ?? 0).toBe(0);
  });

  it("מכשיר זר לא עוקף את המגבלה על ידי החלפת מזהה בלי סוף", async () => {
    const id = A.ids["דנה"];
    let last: any;
    for (let i = 0; i < 25; i++) last = await login(id, "0000", "dev" + i);
    expect(last).toMatchObject({ ok: false, reason: "locked" });
    expect(await login(id, "2222", "dev99")).toMatchObject({ ok: false, reason: "locked" });
  });
});

describe("שחרור נעילה", () => {
  async function lockDana() {
    const id = A.ids["דנה"];
    await login(id, "2222", "mine");
    for (let i = 0; i < MAX_FAILS; i++) await login(id, "0000", "mine");
    return id;
  }

  it("הורה באותה משפחה משחרר נעילה ומנקה את ההתראה", async () => {
    const id = await lockDana();
    await t.mutation(api.auth.unlockPerson, { token: A.tokens["אבא"], personId: id });
    expect(await login(id, "2222", "mine")).toMatchObject({ ok: true });
    expect(await person(id)).toMatchObject({ lockCount: 0 });
  });

  it("הורה ממשפחה אחרת לא יכול לשחרר", async () => {
    const id = await lockDana();
    await expect(t.mutation(api.auth.unlockPerson, { token: B.tokens["אמא"], personId: id })).rejects.toThrow("אדם לא קיים");
    expect(await login(id, "2222", "mine")).toMatchObject({ ok: false, reason: "locked" });
  });

  it("ילד לא יכול לשחרר", async () => {
    const id = await lockDana();
    await expect(t.mutation(api.auth.unlockPerson, { token: A.tokens["דנה"], personId: id })).rejects.toThrow("רק הורים");
  });
});

describe("הקמת משפחה והצטרפות", () => {
  const create = (birthDate: string, extra: object = {}) =>
    t.mutation(api.auth.createFamily, { familyName: "חדשה", name: "הורה", pin: "4444", birthDate, ...extra });
  const yearsAgo = (n: number, dayOffset = 0) => {
    const d = new Date(Date.now()); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  };

  it("רק מי שמעל גיל 18 מקים קופה, והבדיקה מדויקת ליום", async () => {
    await expect(create(yearsAgo(17))).rejects.toThrow("מעל גיל 18");
    await expect(create(yearsAgo(18, 1))).rejects.toThrow("מעל גיל 18"); // מחר יום ההולדת ה-18
    await expect(create("2020-02-30")).rejects.toThrow("תאריך לידה לא תקין");
    await expect(create("garbage")).rejects.toThrow("תאריך לידה לא תקין");
    const ok: any = await create(yearsAgo(18));
    expect(await t.query(api.data.get, { token: ok.token })).toMatchObject({ me: { role: "parent" } });
  });

  it("קוד סודי, מטבע ומדינה נבדקים", async () => {
    await expect(create(yearsAgo(30), { pin: "12" })).rejects.toThrow("4 ספרות");
    await expect(create(yearsAgo(30), { currency: "XXX" })).rejects.toThrow("מטבע לא נתמך");
    await expect(create(yearsAgo(30), { country: "ZZ" })).rejects.toThrow("מדינה לא נתמכת");
  });

  it("הורה יכול לבחור קוד ארוך (4 עד 8 ספרות), וילד/ה רק 4", async () => {
    await expect(create(yearsAgo(30), { pin: "123456789" })).rejects.toThrow("עד 8");
    await create(yearsAgo(30), { pin: "12345678" });
    const created = (await t.run((ctx) => ctx.db.query("people").collect())).find((p) => p.name === "הורה")!;
    expect(created.pinLength).toBe(8);
    // שינוי קוד של הורה קיים לקוד ארוך, והכניסה דורשת את הקוד המלא
    const dad = A.ids["אבא"];
    expect(await t.mutation(api.auth.changeMyPin, { token: A.tokens["אבא"], oldPin: "1111", newPin: "123456" })).toMatchObject({ ok: true });
    expect((await person(dad))!.pinLength).toBe(6);
    expect(await login(dad, "1234", "d9")).toMatchObject({ ok: false, reason: "wrong" });
    expect(await login(dad, "123456", "d9")).toMatchObject({ ok: true });
    // ילד/ה: קוד ארוך נדחה, גם בשינוי קוד וגם בהצטרפות
    expect(await t.mutation(api.auth.changeMyPin, { token: A.tokens["דנה"], oldPin: "2222", newPin: "123456" })).toMatchObject({ ok: false, reason: "format" });
    await expect(t.mutation(api.auth.join, { code: CODE_A, name: "נועה", pin: "123456" })).rejects.toThrow("4 ספרות");
  });

  it("הצטרפות ממתינה לאישור הורה ולא יוצרת אדם לפני כן", async () => {
    const r: any = await t.mutation(api.auth.join, { code: CODE_A, name: "נועה", pin: "5555", device: "new" });
    expect(r).toMatchObject({ ok: true, pending: true });
    const people = await t.run((ctx) => ctx.db.query("people").collect());
    expect(people.some((p) => p.name === "נועה")).toBe(false);
  });

  it("רק הורה מהמשפחה מאשר בקשה, והמצטרף/ת נכנס/ת בתור ילד/ה עם הקוד שבחר/ה", async () => {
    await t.mutation(api.auth.join, { code: CODE_A, name: "נועה", pin: "5555", device: "new" });
    const req = (await t.run((ctx) => ctx.db.query("joinRequests").collect()))[0];
    await expect(t.mutation(api.auth.approveJoin, { token: A.tokens["דנה"], requestId: req._id })).rejects.toThrow("רק הורים");
    await expect(t.mutation(api.auth.approveJoin, { token: B.tokens["אמא"], requestId: req._id })).rejects.toThrow("הבקשה לא קיימת");
    await t.mutation(api.auth.rejectJoin, { token: B.tokens["אמא"], requestId: req._id }); // לא מוחק בקשה זרה
    expect(await t.run((ctx) => ctx.db.query("joinRequests").collect())).toHaveLength(1);

    await t.mutation(api.auth.approveJoin, { token: A.tokens["אבא"], requestId: req._id });
    const noa = (await t.run((ctx) => ctx.db.query("people").collect())).find((p) => p.name === "נועה")!;
    expect(noa.role).toBe("child");
    expect(await login(noa._id, "5555", "new")).toMatchObject({ ok: true });
  });

  it("אי אפשר להצטרף בשם שכבר קיים או עם קוד משפחה שגוי", async () => {
    await expect(t.mutation(api.auth.join, { code: CODE_A, name: "דנה", pin: "5555" })).rejects.toThrow("כבר יש מישהו בשם הזה");
    expect(await t.mutation(api.auth.join, { code: "WRONGCODE1", name: "נועה", pin: "5555" })).toMatchObject({ ok: false, reason: "code" });
    await expect(t.mutation(api.auth.join, { code: CODE_A, name: "נועה", pin: "55" })).rejects.toThrow("4 ספרות");
  });
});
