// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;
let yuval: string, gal: string; // טוקנים
let yuvalId: any, galId: any;

const DATE = "2026-01-01";

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "יובל", role: "teen" }, { name: "דנה", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "גל", role: "teen" }]);
  yuval = A.tokens["יובל"]; gal = B.tokens["גל"];
  yuvalId = A.ids["יובל"]; galId = B.ids["גל"];
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

const enable = async () => {
  await t.mutation(api.friends.approveAccess, { token: A.tokens["אבא"], personId: yuvalId, email: "yuval@x.com" });
  await t.mutation(api.friends.approveAccess, { token: B.tokens["אמא"], personId: galId, email: "gal@x.com" });
};

// שני בני נוער עם מצב חברים מאושר וחברות מאושרת.
const befriend = async () => {
  await enable();
  await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
  const f: any = await t.query(api.friends.get, { token: gal });
  await t.mutation(api.friends.respondFriend, { token: gal, friendshipId: f.friendships[0].id, accept: true });
};

const addDebt = (token: string, from: any, to: any, amount: number, extra: object = {}) =>
  t.mutation(api.friends.addEntry, { token, kind: "debt", from, to, amount, note: "", date: DATE, ...extra });

const view = (token: string) => t.query(api.friends.get, { token }) as Promise<any>;

describe("אישור הורה למצב חברים", () => {
  it("נער/ה מבקש/ת, ההורה מאשר/ת, והמצב נפתח", async () => {
    await t.mutation(api.friends.requestAccess, { token: yuval });
    expect(await view(yuval)).toMatchObject({ enabled: false, requested: true });
    await t.mutation(api.friends.approveAccess, { token: A.tokens["אבא"], personId: yuvalId, email: " Yuval@X.com " });
    expect(await view(yuval)).toMatchObject({ enabled: true, email: "yuval@x.com" });
  });

  it("ילד/ה והורה לא יכולים לבקש, וילד/ה לא יכול/ה לאשר", async () => {
    await expect(t.mutation(api.friends.requestAccess, { token: A.tokens["דנה"] })).rejects.toThrow("בני נוער בלבד");
    await expect(t.mutation(api.friends.requestAccess, { token: A.tokens["אבא"] })).rejects.toThrow("בני נוער בלבד");
    await expect(
      t.mutation(api.friends.approveAccess, { token: A.tokens["דנה"], personId: yuvalId, email: "a@b.com" }),
    ).rejects.toThrow("רק הורים");
  });

  it("הורה ממשפחה אחרת לא יכול לאשר", async () => {
    await expect(
      t.mutation(api.friends.approveAccess, { token: B.tokens["אמא"], personId: yuvalId, email: "a@b.com" }),
    ).rejects.toThrow();
    expect(await view(yuval)).toMatchObject({ enabled: false });
  });

  it("מייל לא תקין או כבר בשימוש נדחה", async () => {
    await expect(
      t.mutation(api.friends.approveAccess, { token: A.tokens["אבא"], personId: yuvalId, email: "nope" }),
    ).rejects.toThrow("לא תקינה");
    await enable();
    await expect(
      t.mutation(api.friends.approveAccess, { token: B.tokens["אמא"], personId: galId, email: "yuval@x.com" }),
    ).rejects.toThrow("כבר בשימוש");
  });

  it("דחייה מבטלת את הבקשה, וכיבוי סוגר את המצב", async () => {
    await t.mutation(api.friends.requestAccess, { token: yuval });
    await t.mutation(api.friends.declineAccess, { token: A.tokens["אבא"], personId: yuvalId });
    expect(await view(yuval)).toMatchObject({ enabled: false, requested: false });
    await enable();
    await t.mutation(api.friends.disableAccess, { token: A.tokens["אבא"], personId: yuvalId });
    expect(await view(yuval)).toMatchObject({ enabled: false });
    await expect(t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" })).rejects.toThrow("עוד לא אושר");
  });
});

describe("חברויות", () => {
  it("בקשה, אישור, והצד השני רואה אותה כנכנסת", async () => {
    await enable();
    await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
    const g = await view(gal);
    expect(g.friendships).toMatchObject([{ status: "pending", incoming: true, other: yuvalId }]);
    expect((await view(yuval)).friendships).toMatchObject([{ status: "pending", incoming: false }]);
    await t.mutation(api.friends.respondFriend, { token: gal, friendshipId: g.friendships[0].id, accept: true });
    expect((await view(yuval)).friendships[0].status).toBe("accepted");
  });

  it("בקשה הדדית מאשרת אוטומטית", async () => {
    await enable();
    await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
    await t.mutation(api.friends.addFriend, { token: gal, email: "yuval@x.com" });
    const g = await view(gal);
    expect(g.friendships).toHaveLength(1);
    expect(g.friendships[0].status).toBe("accepted");
  });

  it("התשובה זהה למייל שלא קיים, ולא נוצרת חברות", async () => {
    await enable();
    const known = await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
    const unknown = await t.mutation(api.friends.addFriend, { token: yuval, email: "ghost@x.com" });
    expect(unknown).toEqual(known);
    expect((await view(yuval)).friendships).toHaveLength(1);
  });

  it("אי אפשר להוסיף את עצמך או מייל לא תקין", async () => {
    await enable();
    await expect(t.mutation(api.friends.addFriend, { token: yuval, email: "yuval@x.com" })).rejects.toThrow("המייל שלך");
    await expect(t.mutation(api.friends.addFriend, { token: yuval, email: "bad" })).rejects.toThrow("לא תקינה");
  });

  it("מגבלת קצב: יותר מ-10 בקשות בשעה נחסמות", async () => {
    await enable();
    for (let i = 0; i < 10; i++) await t.mutation(api.friends.addFriend, { token: yuval, email: `x${i}@x.com` });
    await expect(t.mutation(api.friends.addFriend, { token: yuval, email: "x11@x.com" })).rejects.toThrow("יותר מדי");
  });

  it("רק הצד המקבל יכול להגיב, ודחייה מוחקת את הבקשה", async () => {
    await enable();
    await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
    const g = await view(gal);
    const id = g.friendships[0].id;
    await t.mutation(api.friends.respondFriend, { token: yuval, friendshipId: id, accept: true }); // השולח: אין השפעה
    expect((await view(gal)).friendships[0].status).toBe("pending");
    await t.mutation(api.friends.respondFriend, { token: gal, friendshipId: id, accept: false });
    expect((await view(gal)).friendships).toHaveLength(0);
  });

  it("הסרה נחסמת כשיש יתרה פתוחה, ומותרת אחרי סגירתה", async () => {
    await befriend();
    const id = await addDebt(yuval, yuvalId, galId, 1000);
    await t.mutation(api.friends.confirmEntry, { token: gal, id });
    const fid = (await view(yuval)).friendships[0].id;
    await expect(t.mutation(api.friends.removeFriend, { token: yuval, friendshipId: fid })).rejects.toThrow("יתרה פתוחה");
    const pay = await t.mutation(api.friends.addEntry, { token: yuval, kind: "payment", from: yuvalId, to: galId, amount: 1000, note: "", date: DATE });
    await t.mutation(api.friends.confirmEntry, { token: gal, id: pay });
    await t.mutation(api.friends.removeFriend, { token: yuval, friendshipId: fid });
    expect((await view(yuval)).friendships).toHaveLength(0);
  });
});

describe("רישום חובות בין חברים", () => {
  it("נוצר כממתין, הצד השני מאשר, והוא הופך למאושר", async () => {
    await befriend();
    const id = await addDebt(yuval, yuvalId, galId, 1500);
    expect((await view(gal)).entries[0]).toMatchObject({ amount: 1500, status: "pending", createdBy: yuvalId });
    await t.mutation(api.friends.confirmEntry, { token: gal, id });
    expect((await view(gal)).entries[0].status).toBe("approved");
  });

  it("היוצר/ת לא יכול/ה לאשר לעצמו/ה", async () => {
    await befriend();
    const id = await addDebt(yuval, yuvalId, galId, 1500);
    await t.mutation(api.friends.confirmEntry, { token: yuval, id });
    expect((await view(yuval)).entries[0].status).toBe("pending");
  });

  it("דחייה מוחקת את הרשומה", async () => {
    await befriend();
    const id = await addDebt(yuval, yuvalId, galId, 1500);
    await t.mutation(api.friends.rejectEntry, { token: gal, id });
    expect((await view(gal)).entries).toHaveLength(0);
  });

  it("ולידציות: סכום, תאריך, הערה, עצמי, צד שלישי", async () => {
    await befriend();
    await expect(addDebt(yuval, yuvalId, galId, 0)).rejects.toThrow("סכום לא תקין");
    await expect(addDebt(yuval, yuvalId, galId, 1.5)).rejects.toThrow("סכום לא תקין");
    await expect(addDebt(yuval, yuvalId, galId, 50_001)).rejects.toThrow("סכום לא תקין");
    await expect(addDebt(yuval, yuvalId, galId, 100, { date: "1/1/26" })).rejects.toThrow("תאריך");
    await expect(addDebt(yuval, yuvalId, galId, 100, { note: "x".repeat(81) })).rejects.toThrow("ארוכה");
    await expect(addDebt(yuval, yuvalId, yuvalId, 100)).rejects.toThrow("לעצמו");
    await expect(addDebt(yuval, galId, A.ids["דנה"], 100)).rejects.toThrow("קשורים אליך");
    expect((await view(yuval)).entries).toHaveLength(0);
  });

  it("אי אפשר לרשום עם מי שאינו חבר מאושר", async () => {
    await enable();
    await expect(addDebt(yuval, yuvalId, galId, 100)).rejects.toThrow("חברים מאושרים");
    await t.mutation(api.friends.addFriend, { token: yuval, email: "gal@x.com" });
    await expect(addDebt(yuval, yuvalId, galId, 100)).rejects.toThrow("חברים מאושרים");
  });

  it("ילד/ה והורה לא ניגשים לרישום", async () => {
    await befriend();
    await expect(addDebt(A.tokens["דנה"], A.ids["דנה"], galId, 100)).rejects.toThrow("בני נוער בלבד");
  });

  it("החזר מקושר: לא עולה על יתרת החוב, ולא על חוב שלא אושר", async () => {
    await befriend();
    const debt = await addDebt(yuval, yuvalId, galId, 1000);
    const pay = (amount: number, from = yuvalId, to = galId) =>
      t.mutation(api.friends.addEntry, { token: yuval, kind: "payment", from, to, amount, note: "", date: DATE, debtId: debt });
    await expect(pay(100)).rejects.toThrow("החוב לא נמצא"); // עדיין ממתין
    await t.mutation(api.friends.confirmEntry, { token: gal, id: debt });
    await pay(600);
    await expect(pay(500)).rejects.toThrow("יותר ממה שנשאר");
    await expect(pay(100, galId, yuvalId)).rejects.toThrow("החוב לא נמצא"); // כיוון הפוך
    await pay(400);
    await expect(pay(1)).rejects.toThrow("כבר שולם");
  });

  it("קישור חוב אפשר רק להחזר", async () => {
    await befriend();
    const debt = await addDebt(yuval, yuvalId, galId, 1000);
    await t.mutation(api.friends.confirmEntry, { token: gal, id: debt });
    await expect(addDebt(yuval, yuvalId, galId, 100, { debtId: debt })).rejects.toThrow("רק החזר");
  });

  it("מגבלת קצב: יותר מ-30 רישומים בשעה נחסמים", async () => {
    await befriend();
    for (let i = 0; i < 30; i++) await addDebt(yuval, yuvalId, galId, 100);
    await expect(addDebt(yuval, yuvalId, galId, 100)).rejects.toThrow("יותר מדי רישומים");
  });
});

describe("ביטול רשומה", () => {
  it("היוצר/ת מבטל/ת ממתינה בכל זמן, ומאושרת רק ב-10 הדקות הראשונות", async () => {
    await befriend();
    const pending = await addDebt(yuval, yuvalId, galId, 100);
    vi.advanceTimersByTime(30 * 60 * 1000);
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("sessions").collect()) await ctx.db.patch(s._id, { expiresAt: Date.now() + 3_600_000 });
    });
    await t.mutation(api.friends.removeEntry, { token: yuval, id: pending });
    expect((await view(yuval)).entries).toHaveLength(0);

    const id = await addDebt(yuval, yuvalId, galId, 100);
    await t.mutation(api.friends.confirmEntry, { token: gal, id });
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(t.mutation(api.friends.removeEntry, { token: yuval, id })).rejects.toThrow("10 הדקות");
  });

  it("הצד השני לא יכול למחוק, ומחיקת חוב משחררת החזרים מהקישור", async () => {
    await befriend();
    const debt = await addDebt(yuval, yuvalId, galId, 1000);
    await t.mutation(api.friends.confirmEntry, { token: gal, id: debt });
    const pay = await t.mutation(api.friends.addEntry, { token: yuval, kind: "payment", from: yuvalId, to: galId, amount: 300, note: "", date: DATE, debtId: debt });
    await t.mutation(api.friends.removeEntry, { token: gal, id: debt });
    expect((await view(yuval)).entries).toHaveLength(2);
    await t.mutation(api.friends.removeEntry, { token: yuval, id: debt });
    const left = (await view(yuval)).entries;
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: pay, debtId: null });
  });
});

describe("תצוגת הורה", () => {
  it("הורה רואה רק את בני הנוער במשפחה שלו עם מצב חברים פעיל", async () => {
    await befriend();
    const id = await addDebt(yuval, yuvalId, galId, 2000);
    await t.mutation(api.friends.confirmEntry, { token: gal, id });
    const a: any = await view(A.tokens["אבא"]);
    expect(a.kind).toBe("parent");
    expect(a.teens).toHaveLength(1);
    expect(a.teens[0]).toMatchObject({ name: "יובל", friends: ["גל"] });
    expect(a.teens[0].entries[0]).toMatchObject({ fromName: "יובל", toName: "גל", amount: 2000 });
    const b: any = await view(B.tokens["אמא"]);
    expect(b.teens.map((x: any) => x.name)).toEqual(["גל"]);
  });

  it("ילד/ה מקבל/ת תשובה ריקה, וטוקן לא תקין מחזיר null", async () => {
    expect(await view(A.tokens["דנה"])).toEqual({ kind: "child" });
    expect(await view("nope")).toBeNull();
  });
});

describe("מחיקת אדם מנקה חברויות ורשומות", () => {
  it("purgeFriends מסיר הכול שקשור לאדם", async () => {
    await befriend();
    await addDebt(yuval, yuvalId, galId, 100);
    const { purgeFriends } = await import("../convex/friends");
    await t.run((ctx) => purgeFriends(ctx, yuvalId));
    const left = await t.run(async (ctx) => ({
      f: await ctx.db.query("friendships").collect(),
      e: await ctx.db.query("friendEntries").collect(),
    }));
    expect(left.f).toHaveLength(0);
    expect(left.e).toHaveLength(0);
  });
});
