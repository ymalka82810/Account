// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { hashPin, hashToken, RECOVERY_WAIT_MS } from "../convex/lib";
import { familyCode, newDb, pinProof, seedFamily, T } from "./helpers/seed";

// בדיקות שנוספו בביקורת האבטחה (feature/security-audit): כל בדיקה מכסה תיקון אחד.

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
const CODE = familyCode("A");
const dad = () => A.tokens["אבא"];

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [
    { name: "אבא", role: "parent", pin: "1111" },
    { name: "אמא", role: "parent", pin: "3333" },
    { name: "דנה", role: "child", pin: "2222" },
  ]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

// קושר להורה מפתח (בלי חתימה אמיתית): מספיק לבדיקות שלא מגיעות לאימות החתימה.
const bindKey = (personId: any, credentialId = "dad-phone") =>
  t.run((ctx) => ctx.db.insert("bioKeys", { personId, kind: "android", credentialId, publicKey: "x", alg: -7, createdAt: Date.now() }));

describe("biometric:challenge לא מנפיק אתגרים של מסלול הקוד הסודי", () => {
  beforeEach(async () => { await bindKey(A.ids["אבא"]); });

  it("פעולה שמתחילה ב-pin: נדחית, ולכן אי אפשר לעקוף את הקוד הסודי וטביעת האצבע", async () => {
    await expect(t.mutation(api.biometric.challenge, {
      token: dad(), action: `pin:role:${A.ids["דנה"]}:parent`, credentialId: "dad-phone",
    })).rejects.toThrow("פעולה לא תקינה");
    const rows = await t.run((ctx) => ctx.db.query("bioChallenges").collect());
    expect(rows).toHaveLength(0);
  });

  it("אתגר רגיל עדיין מונפק, ואינו מתקבל כאתגר קוד סודי", async () => {
    const action = `role:${A.ids["דנה"]}:teen`;
    const c: any = await t.mutation(api.biometric.challenge, { token: dad(), action, credentialId: "dad-phone" });
    expect(c.ok).toBe(true);
    await expect(t.mutation(api.people.setRole, {
      token: dad(), id: A.ids["דנה"], role: "teen", proof: { pinChallenge: c.challenge },
    })).rejects.toThrow();
    const kid: any = await t.run((ctx) => ctx.db.get(A.ids["דנה"]));
    expect(kid.role).toBe("child");
  });
});

describe("החלפת מכשיר שאבד: הקוד של ההמתנה לא עוקף אותה", () => {
  beforeEach(async () => {
    await bindKey(A.ids["אבא"]);
    await t.run(async (ctx) => { await ctx.db.patch(A.ids["אבא"], { email: "p@example.com", googleSub: "g-dad" }); });
  });

  const plant = (purpose: "deviceMove" | "deviceRecovery", code: string) => t.run(async (ctx) => {
    for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", A.ids["אבא"])).collect()) {
      if (old.purpose === purpose) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("emailCodes", { personId: A.ids["אבא"], purpose, codeHash: await hashPin(code, "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
  });

  it("recoveryRequest רק בודק את הקוד הסודי ולא מנפיק קוד", async () => {
    const r: any = await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device: "n" });
    expect(r.ok).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("emailCodes").collect())).toHaveLength(0);
  });

  it("הקוד של בקשת ההחלפה לא מתקבל ב-moveStart (בלי לחכות 24 שעות)", async () => {
    await plant("deviceRecovery", "777777");
    const res: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "777777", device: "n" });
    expect(res).toMatchObject({ ok: false, reason: "secretCode" });
    expect(await t.run((ctx) => ctx.db.query("deviceTickets").collect())).toHaveLength(0);
  });

  it("קוד deviceMove לא מתקבל ב-recoveryConfirm, וקוד deviceRecovery כן ופותח המתנה של 24 שעות", async () => {
    await plant("deviceMove", "424242");
    expect(await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", proof: "424242", device: "n" }))
      .toMatchObject({ ok: false, reason: "secretCode" });
    await plant("deviceRecovery", "777777");
    const c: any = await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", proof: "777777", device: "n" });
    expect(c.ok).toBe(true);
    expect(c.readyAt - Date.now()).toBeGreaterThan(RECOVERY_WAIT_MS - 5000);
    expect(await t.mutation(api.deviceMove.recoveryFinish, { code: CODE, personId: A.ids["אבא"], pin: "1111", secret: c.secret, device: "n" }))
      .toMatchObject({ ok: false, reason: "wait" });
  });
});

describe("admin:importData לא יוצר הורים חדשים", () => {
  it("אדם חדש שמסומן בקובץ כהורה נוצר כילד/ה, בלי לעקוף את האישור הביומטרי", async () => {
    const res: any = await t.mutation(api.admin.importData, {
      token: dad(),
      people: [{ id: "p1", name: "הורה חדש", role: "parent" }, { id: "p2", name: "אמא", role: "parent" }, { id: "p3", name: "ילד חדש", role: "child" }],
      entries: [{ kind: "debt", from: "p1", to: "p2", amount: 1000, date: "2025-05-01" }],
    });
    expect(res).toEqual({ added: 1 });
    const people = await t.run((ctx) => ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", A.familyId)).collect());
    const byName = Object.fromEntries(people.map((p) => [p.name, p]));
    expect(byName["הורה חדש"].role).toBe("child");
    expect(byName["ילד חדש"].role).toBe("child");
    expect(byName["אמא"].role).toBe("parent"); // אדם קיים לא משתנה
    expect(people.filter((p) => p.role === "parent").map((p) => p.name).sort()).toEqual(["אבא", "אמא"]);
  });
});

describe("auth:changeMyPin מנתק את שאר המכשירים", () => {
  it("אחרי שינוי קוד הסשן הנוכחי נשאר והסשנים האחרים של אותו אדם נמחקים", async () => {
    const other = await t.run(async (ctx) => {
      await ctx.db.insert("sessions", { personId: A.ids["דנה"], tokenHash: await hashToken("other-device"), expiresAt: Date.now() + 3_600_000 });
      await ctx.db.insert("sessions", { personId: A.ids["אמא"], tokenHash: await hashToken("mom-other"), expiresAt: Date.now() + 3_600_000 });
      return "other-device";
    });
    expect(await t.query(api.data.get, { token: other })).not.toBeNull();
    const res = await t.mutation(api.auth.changeMyPin, { token: A.tokens["דנה"], oldPin: "2222", newPin: "4321" });
    expect(res).toMatchObject({ ok: true });
    expect(await t.query(api.data.get, { token: A.tokens["דנה"] })).not.toBeNull();
    expect(await t.query(api.data.get, { token: other })).toBeNull();
    // סשן של אדם אחר לא נפגע
    expect(await t.query(api.data.get, { token: "mom-other" })).not.toBeNull();
  });

  it("קוד ישן שגוי לא מנתק אף אחד", async () => {
    await t.run(async (ctx) => { await ctx.db.insert("sessions", { personId: A.ids["דנה"], tokenHash: await hashToken("other-device"), expiresAt: Date.now() + 3_600_000 }); });
    expect(await t.mutation(api.auth.changeMyPin, { token: A.tokens["דנה"], oldPin: "0000", newPin: "4321" })).toMatchObject({ ok: false, reason: "wrong" });
    expect(await t.query(api.data.get, { token: "other-device" })).not.toBeNull();
  });
});

describe("auth:join שומר מזהה מכשיר מנוקה ומוגבל באורך", () => {
  it("מחרוזת device ארוכה או עם תווים מיוחדים לא נשמרת כמו שהיא, והמכשיר עדיין הופך למהימן באישור", async () => {
    const huge = "ab-" + "x".repeat(5000) + "<script>";
    await t.mutation(api.auth.join, { code: CODE, name: "נועה", pin: "5555", device: huge, shareNotebook: true });
    const req: any = (await t.run((ctx) => ctx.db.query("joinRequests").collect()))[0];
    expect(req.device).toBe("ab" + "x".repeat(38));
    expect(req.device.length).toBeLessThanOrEqual(40);
    await t.mutation(api.auth.approveJoin, { token: dad(), requestId: req._id });
    const noa: any = (await t.run((ctx) => ctx.db.query("people").collect())).find((p: any) => p.name === "נועה");
    expect(noa.trustedDevices).toHaveLength(1);
  });
});

describe("מחיקת אדם או קופה מנקה גם שאריות כניסה ויומן", () => {
  const plantAuthRows = (personId: any) => t.run(async (ctx) => {
    await ctx.db.insert("emailCodes", { personId, email: "p@example.com", purpose: "pinReset", codeHash: "h", salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
    await ctx.db.insert("deviceTickets", { personId, ticketHash: "t" + personId, expiresAt: Date.now() + 600_000 });
    await ctx.db.insert("deviceRecoveries", { personId, secretHash: "s", requestedAt: Date.now(), readyAt: Date.now(), expiresAt: Date.now() + 600_000 });
  });
  const authRowsOf = (personId: any) => t.run(async (ctx) => [
    ...(await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", personId)).collect()),
    ...(await ctx.db.query("deviceTickets").withIndex("by_person", (q) => q.eq("personId", personId)).collect()),
    ...(await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", personId)).collect()),
  ]);

  it("people:remove מוחק קודי מייל, כרטיסי קישור ובקשות שחזור של האדם בלבד", async () => {
    await plantAuthRows(A.ids["דנה"]);
    await plantAuthRows(A.ids["אמא"]);
    await t.mutation(api.people.remove, { token: dad(), id: A.ids["דנה"] });
    expect(await authRowsOf(A.ids["דנה"])).toHaveLength(0);
    expect(await authRowsOf(A.ids["אמא"])).toHaveLength(3);
  });

  it("family:remove מוחק את כל השאריות והיומן של הקופה, ולא נוגע בקופה אחרת", async () => {
    const B = await seedFamily(t, "B", [{ name: "סבתא", role: "parent", pin: "1111" }]);
    for (const id of [A.ids["אבא"], A.ids["אמא"], A.ids["דנה"], B.ids["סבתא"]]) await plantAuthRows(id);
    await t.mutation(api.entries.add, { token: dad(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 100, note: "", date: "2026-01-15" });
    expect((await t.run((ctx) => ctx.db.query("activity").withIndex("by_family_at", (q) => q.eq("familyId", A.familyId)).collect())).length).toBeGreaterThan(0);

    await t.mutation(api.family.remove, { token: dad(), confirmName: "A", proof: await pinProof(t, A.ids["אבא"], "family-remove") });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run((ctx) => ctx.db.query("activity").withIndex("by_family_at", (q) => q.eq("familyId", A.familyId)).collect())).toHaveLength(0);
    for (const id of [A.ids["אבא"], A.ids["אמא"], A.ids["דנה"]]) expect(await authRowsOf(id)).toHaveLength(0);
    expect(await authRowsOf(B.ids["סבתא"])).toHaveLength(3);
  });
});

describe("requireParent: הורה לא קשור לא פועל כהורה כשיש במשפחה הורה קשור", () => {
  const mom = () => A.tokens["אמא"];

  it("כשאין הורה קשור במשפחה, הורה לא קשור פועל כרגיל (הקמה, משפחה ישנה)", async () => {
    await t.mutation(api.family.rename, { token: mom(), name: "שם חדש" });
    expect(await t.query(api.biometric.deviceStatus, { token: mom() })).toMatchObject({ bound: false, canBindSelf: true });
  });

  it("כשיש הורה קשור: פעולות הורה נדחות להורה הלא קשור, וההורה הקשור ממשיך כרגיל", async () => {
    await bindKey(A.ids["אבא"]);
    await expect(t.mutation(api.family.rename, { token: mom(), name: "x" })).rejects.toThrow("לקשר את המכשיר");
    await expect(t.mutation(api.people.add, { token: mom(), name: "חדש", role: "child" })).rejects.toThrow("לקשר את המכשיר");
    await expect(t.query(api.activity.list, { token: mom() })).rejects.toThrow("לקשר את המכשיר");
    await t.mutation(api.family.rename, { token: dad(), name: "בית" });
  });

  it("זרימות הקישור עצמן עובדות להורה לא קשור, והנתונים הבסיסיים נטענים", async () => {
    await bindKey(A.ids["אבא"]);
    expect(await t.query(api.biometric.deviceStatus, { token: mom() })).toMatchObject({ bound: false, canBindSelf: false });
    expect(await t.mutation(api.biometric.registerStart, { token: mom(), myPin: "3333" })).toMatchObject({ ok: false, reason: "needBindCode" });
    expect(await t.query(api.data.get, { token: mom() })).not.toBeNull();
  });

  it("סשן שנפתח באיפוס קוד בגוגל להורה לא קשור לא נותן הרשאות הורה כשיש הורה קשור", async () => {
    await bindKey(A.ids["אבא"]);
    await t.run(async (ctx) => {
      await ctx.db.patch(A.ids["אמא"], { email: "m@example.com", googleSub: "g-mom" });
      await ctx.db.insert("emailCodes", { personId: A.ids["אמא"], purpose: "pinReset", codeHash: await hashPin("123456", "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
    });
    const res: any = await t.mutation(api.googleLink.resetWithProof, { code: CODE, personId: A.ids["אמא"], proof: "123456", newPin: "5555", device: "m" });
    expect(res.ok).toBe(true);
    await expect(t.mutation(api.family.rename, { token: res.token, name: "x" })).rejects.toThrow("לקשר את המכשיר");
  });
});

describe("פעולות הרסניות של הורה דורשות אישור (ביומטרי או קוד סודי)", () => {
  const dadId = () => A.ids["אבא"];

  it("family:remove לא עובד עם שם משפחה בלבד, ולא עם אישור של פעולה אחרת", async () => {
    await expect(t.mutation(api.family.remove, { token: dad(), confirmName: "A" })).rejects.toThrow();
    await expect(t.mutation(api.family.remove, { token: dad(), confirmName: "A", proof: await pinProof(t, dadId(), "family-rotate") })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(A.familyId))).not.toBeNull();
  });

  it("family:rotateCode דורש אישור, והקוד לא מוחלף בלעדיו", async () => {
    const before: any = await t.run((ctx) => ctx.db.get(A.familyId));
    await expect(t.mutation(api.family.rotateCode, { token: dad() })).rejects.toThrow();
    expect(((await t.run((ctx) => ctx.db.get(A.familyId))) as any).childCode).toBe(before.childCode);
    await t.mutation(api.family.rotateCode, { token: dad(), proof: await pinProof(t, dadId(), "family-rotate") });
    expect(((await t.run((ctx) => ctx.db.get(A.familyId))) as any).childCode).not.toBe(before.childCode);
  });

  it("הסרת הורה דורשת אישור שקשור להורה הזה בדיוק; הסרת ילד/ה לא דורשת", async () => {
    await expect(t.mutation(api.people.remove, { token: dad(), id: A.ids["אמא"] })).rejects.toThrow();
    await expect(t.mutation(api.people.remove, { token: dad(), id: A.ids["אמא"], proof: await pinProof(t, dadId(), `person-remove:${A.ids["דנה"]}`) })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(A.ids["אמא"]))).not.toBeNull();
    await t.mutation(api.people.remove, { token: dad(), id: A.ids["דנה"] });
    await t.mutation(api.people.remove, { token: dad(), id: A.ids["אמא"], proof: await pinProof(t, dadId(), `person-remove:${A.ids["אמא"]}`) });
    expect(await t.run((ctx) => ctx.db.get(A.ids["אמא"]))).toBeNull();
  });

  it("אישור קוד סודי הוא חד-פעמי", async () => {
    const proof = await pinProof(t, dadId(), "family-rotate");
    await t.mutation(api.family.rotateCode, { token: dad(), proof });
    await expect(t.mutation(api.family.rotateCode, { token: dad(), proof })).rejects.toThrow();
  });

  it("biometric:pinConfirm מנפיק אתגר לפעולות החדשות, ולא לפעולות אחרות", async () => {
    for (const action of ["family-remove", "family-rotate", `person-remove:${A.ids["אמא"]}`]) {
      expect(await t.mutation(api.biometric.pinConfirm, { token: dad(), action, myPin: "1111" })).toMatchObject({ ok: true });
    }
    await expect(t.mutation(api.biometric.pinConfirm, { token: dad(), action: "reveal-code", myPin: "1111" })).rejects.toThrow();
    await expect(t.mutation(api.biometric.pinConfirm, { token: dad(), action: "family-removeX", myPin: "1111" })).rejects.toThrow();
  });
});

describe("הגבלות קצב: כרטיסי מכשיר ובקשות הצטרפות", () => {
  const passes = () => t.run((ctx) => ctx.db.query("devicePasses").withIndex("by_family", (q) => q.eq("familyId", A.familyId)).collect());

  it("auth:enter עם remember מנפיק כרטיס, אבל אחרי 10 בשעה ממכשיר אחד לא מנפיק עוד (והכניסה עצמה עובדת)", async () => {
    for (let i = 0; i < 10; i++) expect(((await t.mutation(api.auth.enter, { code: CODE, device: "flood", remember: true })) as any).loginCode).toBeTruthy();
    const r: any = await t.mutation(api.auth.enter, { code: CODE, device: "flood", remember: true });
    expect(r.ok).toBe(true);
    expect(r.loginCode).toBeUndefined();
    expect(await passes()).toHaveLength(10);
    // מכשיר אחר לא מושפע
    expect(((await t.mutation(api.auth.enter, { code: CODE, device: "other", remember: true })) as any).loginCode).toBeTruthy();
  });

  it("תקרה למשפחה: לא מונפקים כרטיסים מעבר ל-50 גם ממכשירים שונים", async () => {
    for (let i = 0; i < 50; i++) await t.mutation(api.auth.enter, { code: CODE, device: "d" + i, remember: true });
    expect(await passes()).toHaveLength(50);
    expect(((await t.mutation(api.auth.enter, { code: CODE, device: "d99", remember: true })) as any).loginCode).toBeUndefined();
    expect(await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] })).toEqual({ ok: false });
    expect(await passes()).toHaveLength(50);
  });

  it("auth:deviceCard מוגבל לאדם בשעה, והכרטיס נושא את שם מי שביקש", async () => {
    const first: any = await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] });
    expect(first.ok).toBe(true);
    expect((await passes())[0].label).toBe("דנה");
    for (let i = 1; i < 10; i++) expect(((await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] })) as any).ok).toBe(true);
    expect(await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] })).toEqual({ ok: false });
    expect(((await t.mutation(api.auth.deviceCard, { token: A.tokens["אבא"] })) as any).ok).toBe(true);
    // אחרי שעה אפשר שוב
    vi.advanceTimersByTime(61 * 60 * 1000);
    await t.run(async (ctx) => { for (const x of await ctx.db.query("sessions").collect()) await ctx.db.patch(x._id, { expiresAt: Date.now() + 3_600_000 }); });
    expect(((await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] })) as any).ok).toBe(true);
  });

  it("auth:join: 3 בקשות בשעה ממכשיר אחד, ואז throttled בלי ליצור בקשה", async () => {
    for (let i = 0; i < 3; i++) expect(await t.mutation(api.auth.join, { code: CODE, name: "נ" + i, pin: "5555", device: "j", shareNotebook: true })).toMatchObject({ ok: true });
    expect(await t.mutation(api.auth.join, { code: CODE, name: "נ9", pin: "5555", device: "j", shareNotebook: true })).toMatchObject({ ok: false, reason: "throttled" });
    expect(await t.run((ctx) => ctx.db.query("joinRequests").collect())).toHaveLength(3);
    expect(await t.mutation(api.auth.join, { code: CODE, name: "נ9", pin: "5555", device: "k", shareNotebook: true })).toMatchObject({ ok: true });
  });

  it("auth:join: תקרה של 15 בקשות בשעה לכל משפחה, גם ממכשירים שונים", async () => {
    for (let i = 0; i < 15; i++) {
      // ההורים מטפלים בבקשות, כדי שתקרת 10 הממתינות לא תסתיר את הבדיקה
      const r: any = await t.mutation(api.auth.join, { code: CODE, name: "ש" + i, pin: "5555", device: "x" + i, shareNotebook: true });
      expect(r.ok).toBe(true);
      for (const j of await t.run((ctx) => ctx.db.query("joinRequests").collect())) await t.mutation(api.auth.rejectJoin, { token: dad(), requestId: j._id });
    }
    expect(await t.mutation(api.auth.join, { code: CODE, name: "אחרון", pin: "5555", device: "zz", shareNotebook: true })).toMatchObject({ ok: false, reason: "throttled" });
  });
});

describe("fx:ensure מוגבל בקצב", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ result: "success", rates: { ILS: 3.7, EUR: 0.9, GBP: 0.8 } })));

  it("שערים ישנים: קריאות חוזרות לא מציפות את הספק, אחת כל 5 דקות", async () => {
    const spy = okFetch();
    vi.stubGlobal("fetch", spy);
    for (let i = 0; i < 5; i++) await t.action(api.fx.ensure, {});
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4 * 60 * 1000);
    await t.action(api.fx.ensure, {});
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3 * 60 * 60 * 1000); // עברו גם 5 דקות וגם הטריות
    await t.action(api.fx.ensure, {});
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("push:subscribe מקבל רק שרתי Push מוכרים", () => {
  const sub = (endpoint: string) => t.mutation(api.push.subscribe, { token: A.tokens["דנה"], endpoint, p256dh: "k", auth: "a" });
  const good = [
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://updates-autopush.stage.mozaws.net.push.services.mozilla.com/wpush/v2/x",
    "https://web.push.apple.com/QGxyz",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ];
  const bad = [
    "http://fcm.googleapis.com/fcm/send/x", "https://attacker.example.com/x", "https://fcm.googleapis.com.evil.com/x",
    "https://evilfcm.googleapis.com/x", "https://fcm.googleapis.com@evil.com/x", "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://notify.windows.com.evil.io/x",
    "not a url", "https://" + "a".repeat(1000) + ".notify.windows.com/x",
  ];

  it("כתובות של Chrome, Firefox, Safari ו-Edge נרשמות", async () => {
    for (const e of good) await sub(e);
    expect(await t.run((ctx) => ctx.db.query("pushSubs").collect())).toHaveLength(good.length);
  });

  it("כתובות אחרות (כולל הטעיות של שם מארח, פורט, הרשאות ו-IP פנימי) נדחות", async () => {
    for (const e of bad) await expect(sub(e)).rejects.toThrow("מנוי התראות לא תקין");
    expect(await t.run((ctx) => ctx.db.query("pushSubs").collect())).toHaveLength(0);
  });
});

describe("push:subscribeNative (אפליקציית אנדרואיד, FCM)", () => {
  const tok = "dXyz123_abc-DEF:APA91bHkJ4n0pQ7rS8tUvWxYz";
  const native = (deviceToken: string, who = "דנה") => t.mutation(api.push.subscribeNative, { token: A.tokens[who], deviceToken });

  it("אסימון תקין נרשם בכתובת fcm:", async () => {
    await native(tok);
    const subs = await t.run((ctx) => ctx.db.query("pushSubs").collect());
    expect(subs.map((s) => s.endpoint)).toEqual([`fcm:${tok}`]);
  });

  it("אותו אסימון עובר לאדם שמחובר עכשיו ולא נשמר פעמיים", async () => {
    await native(tok, "דנה");
    await native(tok, "אבא");
    const subs = await t.run((ctx) => ctx.db.query("pushSubs").collect());
    expect(subs).toHaveLength(1);
    expect(subs[0].personId).toBe(A.ids["אבא"]);
  });

  it("אסימון עם תווים לא תקינים, קצר מדי או ארוך מדי נדחה", async () => {
    for (const bad of ["short", "has space in it 1234567890", "https://evil.example.com/x/1234567890", "a".repeat(4097)]) {
      await expect(native(bad)).rejects.toThrow("מנוי התראות לא תקין");
    }
  });

  it("push:subscribe לא מקבל כתובת fcm: (לא עוקפים את רשימת השרתים המוכרים)", async () => {
    await expect(t.mutation(api.push.subscribe, { token: A.tokens["דנה"], endpoint: `fcm:${tok}`, p256dh: "k", auth: "a" })).rejects.toThrow("מנוי התראות לא תקין");
  });

  it("push:unsubscribe מסיר את האסימון של המחובר בלבד", async () => {
    await native(tok, "דנה");
    await t.mutation(api.push.unsubscribe, { token: A.tokens["אבא"], endpoint: `fcm:${tok}` });
    expect(await t.run((ctx) => ctx.db.query("pushSubs").collect())).toHaveLength(1);
    await t.mutation(api.push.unsubscribe, { token: A.tokens["דנה"], endpoint: `fcm:${tok}` });
    expect(await t.run((ctx) => ctx.db.query("pushSubs").collect())).toHaveLength(0);
  });
});
