// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { hashPin, hashToken, RECOVERY_WAIT_MS } from "../convex/lib";
import { familyCode, newDb, seedFamily, T } from "./helpers/seed";

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

describe("החלפת מכשיר שאבד: קוד המייל של ההמתנה לא עוקף אותה", () => {
  beforeEach(async () => {
    await bindKey(A.ids["אבא"]);
    await t.run(async (ctx) => { await ctx.db.patch(A.ids["אבא"], { email: "p@example.com", emailVerified: true }); });
  });

  const plant = (purpose: "deviceMove" | "deviceRecovery", code: string) => t.run(async (ctx) => {
    for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", A.ids["אבא"])).collect()) {
      if (old.purpose === purpose) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("emailCodes", { personId: A.ids["אבא"], email: "", purpose, codeHash: await hashPin(code, "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
  });

  it("recoveryRequest שולח קוד במטרה deviceRecovery ולא deviceMove", async () => {
    const r: any = await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device: "n" });
    expect(r.ok).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query("emailCodes").collect());
    expect(rows.map((x) => x.purpose)).toEqual(["deviceRecovery"]);
  });

  it("קוד המייל של בקשת ההחלפה לא מתקבל ב-moveStart (בלי לחכות 24 שעות)", async () => {
    await plant("deviceRecovery", "777777");
    const res: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "email", secretCode: "777777", device: "n" });
    expect(res).toMatchObject({ ok: false, reason: "secretCode" });
    expect(await t.run((ctx) => ctx.db.query("deviceTickets").collect())).toHaveLength(0);
  });

  it("קוד deviceMove לא מתקבל ב-recoveryConfirm, וקוד deviceRecovery כן ופותח המתנה של 24 שעות", async () => {
    await plant("deviceMove", "424242");
    expect(await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", emailCode: "424242", device: "n" }))
      .toMatchObject({ ok: false, reason: "secretCode" });
    await plant("deviceRecovery", "777777");
    const c: any = await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", emailCode: "777777", device: "n" });
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
