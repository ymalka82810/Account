// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { hashPin, RECOVERY_WAIT_MS } from "../convex/lib";
import { familyCode, newDb, seedFamily, T } from "./helpers/seed";

// בדיקות קישור הורה למכשיר: כניסה כהורה דורשת גם קוד סודי וגם חתימה של המפתח שבמכשיר.
// המכשירים כאן הם מפתחות ECDSA אמיתיים (כמו ב-Android Keystore), והשרת בודק את החתימות באמת.

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
const CODE = familyCode("A");

type Dev = { alias: string; publicKey: string; priv: CryptoKey };
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const trim = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; const x = Array.from(b.slice(i)); return x[0] & 0x80 ? [0, ...x] : x; };
const toDer = (raw: Uint8Array) => {
  const r = trim(raw.slice(0, 32)), s = trim(raw.slice(32));
  const body = [0x02, r.length, ...r, 0x02, s.length, ...s];
  return new Uint8Array([0x30, body.length, ...body]);
};

// "מכשיר": זוג מפתחות שהמפתח הפרטי שלו נשאר אצלו.
async function newDevice(alias: string): Promise<Dev> {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { alias, priv: privateKey, publicKey: b64(new Uint8Array(await crypto.subtle.exportKey("spki", publicKey))) };
}
const signWith = async (d: Dev, challenge: string) =>
  b64(toDer(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, d.priv, new TextEncoder().encode("account-bio:" + challenge)))));

const keyPayload = async (d: Dev, challenge: string) => ({
  challenge, kind: "android" as const, credentialId: d.alias, publicKey: d.publicKey, alg: -7, signature: await signWith(d, challenge),
});

// קישור ראשון (כמו אחרי הקמת קופה): קוד סודי, ואז רישום המפתח.
async function firstBind(who: string, d: Dev, pin: string) {
  const start: any = await t.mutation(api.biometric.registerStart, { token: A.tokens[who], myPin: pin });
  expect(start.ok).toBe(true);
  await t.mutation(api.biometric.registerFinish, { token: A.tokens[who], ...(await keyPayload(d, start.challenge)) });
}

// אישור פעולה רגישה בטביעת אצבע מהמכשיר הקשור.
async function prove(who: string, d: Dev, action: string) {
  const c: any = await t.mutation(api.biometric.challenge, { token: A.tokens[who], action, credentialId: d.alias });
  expect(c.ok).toBe(true);
  return { challenge: c.challenge, credentialId: d.alias, signature: await signWith(d, c.challenge) };
}

// הוכחת מכשיר לכניסה (לפני שיש סשן).
async function loginProof(personId: any, d: Dev, device = "dev-x") {
  const c: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId, device });
  if (!c.ok) return undefined;
  return { challenge: c.challenge, credentialId: d.alias, signature: await signWith(d, c.challenge) };
}

const login = (personId: any, pin: string, proof?: any, device = "dev-x") =>
  t.mutation(api.auth.login, { code: CODE, personId, pin, device, proof });

// קוד שנשלח למייל, בלי לקרוא מייל: שותלים קוד ידוע במקום שהשרת היה שומר.
async function plantCode(personId: any, purpose: "deviceMove" | "deviceBind", code: string) {
  await t.run(async (ctx) => {
    // מוחקים קוד אמיתי שהשרת כבר הנפיק, כדי שהקוד הידוע יהיה היחיד.
    for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
      if (old.purpose === purpose) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("emailCodes", { personId, email: "", purpose, codeHash: await hashPin(code, "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
  });
}
const verifyEmail = (id: any) => t.run(async (ctx) => { await ctx.db.patch(id, { email: "p@example.com", emailVerified: true }); });
const sessionsOf = (id: any) => t.run((ctx) => ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", id)).collect());

let dad: Dev, mom: Dev, kid: Dev;

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [
    { name: "אבא", role: "parent", pin: "1111" },
    { name: "אמא", role: "parent", pin: "3333" },
    { name: "דנה", role: "child", pin: "2222" },
  ]);
  dad = await newDevice("dad-phone");
  mom = await newDevice("mom-phone");
  kid = await newDevice("kid-phone");
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

describe("כניסה כהורה דורשת את המכשיר", () => {
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); });

  it("הורה קשור נכנס עם קוד סודי וחתימה מהמכשיר שלו", async () => {
    const proof = await loginProof(A.ids["אבא"], dad);
    expect(await login(A.ids["אבא"], "1111", proof)).toMatchObject({ ok: true, needBind: false });
  });

  it("ילד שיודע את הקוד הסודי של ההורה לא נכנס ממכשיר אחר, גם לא עם מפתח משלו", async () => {
    expect(await login(A.ids["אבא"], "1111")).toMatchObject({ ok: false, reason: "device" });
    // המכשיר של הילד מבקש אתגר ויוצר חתימה, אבל המפתח שלו לא רשום אצל ההורה.
    const c: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["אבא"], device: "kid" });
    const forged = { challenge: c.challenge, credentialId: kid.alias, signature: await signWith(kid, c.challenge) };
    expect(await login(A.ids["אבא"], "1111", forged, "kid")).toMatchObject({ ok: false, reason: "device" });
    // גם אם מעתיקים את מזהה המפתח של ההורה, החתימה לא תתאים.
    const c2: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["אבא"], device: "kid" });
    const forged2 = { challenge: c2.challenge, credentialId: dad.alias, signature: await signWith(kid, c2.challenge) };
    expect(await login(A.ids["אבא"], "1111", forged2, "kid")).toMatchObject({ ok: false, reason: "device" });
    expect(await sessionsOf(A.ids["אבא"])).toHaveLength(1); // רק הסשן שנוצר בהקמה
  });

  it("בלי חתימה לא בודקים בכלל את הקוד הסודי: אי אפשר לנחש אותו ואי אפשר ללמוד אם נכון", async () => {
    for (let i = 0; i < 40; i++) expect(await login(A.ids["אבא"], String(1000 + i), undefined, "attacker")).toMatchObject({ reason: "device" });
    const p: any = await t.run((ctx) => ctx.db.get(A.ids["אבא"]));
    expect(p.lockedUntil).toBeUndefined();
    expect(p.failedAttempts ?? 0).toBe(0);
  });

  it("חתימה ישנה לא עובדת פעם שנייה", async () => {
    const proof = await loginProof(A.ids["אבא"], dad);
    expect(await login(A.ids["אבא"], "1111", proof)).toMatchObject({ ok: true });
    expect(await login(A.ids["אבא"], "1111", proof)).toMatchObject({ ok: false, reason: "device" });
  });

  it("הקוד הסודי עדיין נדרש גם עם המכשיר הנכון", async () => {
    const proof = await loginProof(A.ids["אבא"], dad);
    expect(await login(A.ids["אבא"], "9999", proof)).toMatchObject({ ok: false, reason: "wrong" });
  });

  it("אתגר כניסה ניתן רק למי שיש לו קוד משפחה, ולא נחשף לאדם ממשפחה אחרת", async () => {
    expect(await t.mutation(api.biometric.loginChallenge, { code: "WRONGCODE1", personId: A.ids["אבא"], device: "d" })).toMatchObject({ ok: false, reason: "code" });
    expect(await t.mutation(api.biometric.loginChallenge, { personId: A.ids["אבא"], device: "d" })).toMatchObject({ ok: false, reason: "code" });
    // ילד אין לו מפתח
    expect(await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["דנה"], device: "d" })).toMatchObject({ ok: false, reason: "code" });
  });

  it("מכשיר זר שמציף באתגרים לא דוחק החוצה את האתגר של ההורה", async () => {
    const c: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["אבא"], device: "dad-device" });
    for (let i = 0; i < 30; i++) await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["אבא"], device: "kid-flood" });
    const proof = { challenge: c.challenge, credentialId: dad.alias, signature: await signWith(dad, c.challenge) };
    expect(await login(A.ids["אבא"], "1111", proof, "dad-device")).toMatchObject({ ok: true });
  });

  it("אין דרך לרשום מפתח שני: registerStart נדחה, וגם הרישום עצמו", async () => {
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111" })).toMatchObject({ ok: false, reason: "bound" });
  });

  it("איפוס קוד במייל לא פותח סשן להורה קשור (הוא נכנס מהמכשיר שלו)", async () => {
    await verifyEmail(A.ids["אבא"]);
    await t.run(async (ctx) => { await ctx.db.insert("emailCodes", { personId: A.ids["אבא"], email: "p@example.com", purpose: "pinReset", codeHash: await hashPin("123456", "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 }); });
    const res: any = await t.mutation(api.emailAuth.resetWithCode, { code: CODE, personId: A.ids["אבא"], emailCode: "123456", newPin: "5555", device: "kid" });
    expect(res.ok).toBe(true);
    expect(res.token).toBeUndefined();
    const proof = await loginProof(A.ids["אבא"], dad);
    expect(await login(A.ids["אבא"], "5555", proof)).toMatchObject({ ok: true });
  });
});

describe("הורה שני", () => {
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); });

  it("הורה לא קשור לא יכול להיכנס רק עם קוד סודי כשיש במשפחה הורה קשור", async () => {
    expect(await login(A.ids["אמא"], "3333")).toMatchObject({ ok: false, reason: "needBind" });
    // וגם לא לקשור בעצמו מכשיר עם הסשן שיש לו
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אמא"], myPin: "3333" })).toMatchObject({ ok: false, reason: "needBindCode" });
  });

  it("קוד קישור מהורה קשור מקשר את המכשיר של ההורה השני, ואז רק ממנו הוא נכנס", async () => {
    const issued: any = await t.mutation(api.deviceMove.issueBindCode, {
      token: A.tokens["אבא"], personId: A.ids["אמא"], proof: await prove("אבא", dad, `bind:${A.ids["אמא"]}`),
    });
    expect(issued.code).toMatch(/^\d{6}$/);
    // אדם אחר עם הקוד הסודי של אמא אבל בלי קוד הקישור לא מתקדם
    expect(await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אמא"], pin: "3333", method: "parent", secretCode: "000000", device: "kid" }))
      .toMatchObject({ ok: false, reason: "secretCode" });
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אמא"], pin: "3333", method: "parent", secretCode: issued.code, device: "mom" });
    expect(start.ok).toBe(true);
    const fin: any = await t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(mom, start.challenge)) });
    expect(fin.ok).toBe(true);
    expect(await login(A.ids["אמא"], "3333", undefined, "kid")).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אמא"], "3333", await loginProof(A.ids["אמא"], mom, "mom"), "mom")).toMatchObject({ ok: true });
  });

  it("בלי הקוד הסודי של ההורה הזה, גם עם קוד קישור נכון, אי אפשר לקשור", async () => {
    const issued: any = await t.mutation(api.deviceMove.issueBindCode, {
      token: A.tokens["אבא"], personId: A.ids["אמא"], proof: await prove("אבא", dad, `bind:${A.ids["אמא"]}`),
    });
    expect(await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אמא"], pin: "0000", method: "parent", secretCode: issued.code, device: "kid" }))
      .toMatchObject({ ok: false, reason: "wrong" });
  });

  it("אי אפשר להנפיק קוד קישור בלי טביעת אצבע, לילד, או עם אישור של פעולה אחרת", async () => {
    await expect(t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["אבא"], personId: A.ids["אמא"] })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["אבא"], personId: A.ids["דנה"], proof: await prove("אבא", dad, `bind:${A.ids["דנה"]}`) })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["אבא"], personId: A.ids["אמא"], proof: await prove("אבא", dad, `role:${A.ids["אמא"]}:child`) })).rejects.toThrow();
    // ילד לא יכול בכלל
    await expect(t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["דנה"], personId: A.ids["אמא"] })).rejects.toThrow();
  });

  it("הורה קשור יכול להחליף מכשיר להורה שהטלפון שלו נהרס (המפתח הישן מוחלף)", async () => {
    // קודם אמא קשורה
    const i1: any = await t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["אבא"], personId: A.ids["אמא"], proof: await prove("אבא", dad, `bind:${A.ids["אמא"]}`) });
    const s1: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אמא"], pin: "3333", method: "parent", secretCode: i1.code, device: "m1" });
    await t.mutation(api.deviceMove.moveFinish, { ticket: s1.ticket, ...(await keyPayload(mom, s1.challenge)) });
    // הטלפון נהרס: אבא מנפיק קוד, ואמא נקשרת למכשיר חדש
    const mom2 = await newDevice("mom-new");
    const i2: any = await t.mutation(api.deviceMove.issueBindCode, { token: A.tokens["אבא"], personId: A.ids["אמא"], proof: await prove("אבא", dad, `bind:${A.ids["אמא"]}`) });
    const s2: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אמא"], pin: "3333", method: "parent", secretCode: i2.code, device: "m2" });
    await t.mutation(api.deviceMove.moveFinish, { ticket: s2.ticket, ...(await keyPayload(mom2, s2.challenge)) });
    expect(await loginProof(A.ids["אמא"], mom, "m1").then((p) => login(A.ids["אמא"], "3333", p, "m1"))).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אמא"], "3333", await loginProof(A.ids["אמא"], mom2, "m2"), "m2")).toMatchObject({ ok: true });
  });
});

describe("החלפת מכשיר מהמכשיר הישן", () => {
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); await verifyEmail(A.ids["אבא"]); });
  const newPhone = async () => newDevice("dad-new");

  it("דורשת טביעת אצבע במכשיר הישן ומייל מאומת", async () => {
    await expect(t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"] })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "role:x:y") })).rejects.toThrow();
    expect(await t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "move-device") })).toMatchObject({ ok: true });
    // בלי מייל מאומת
    await t.run(async (ctx) => { await ctx.db.patch(A.ids["אבא"], { emailVerified: false }); });
    await expect(t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "move-device") })).rejects.toThrow();
  });

  it("המכשיר החדש צריך קוד סודי וקוד מהמייל; אחרי ההחלפה הישן נותק", async () => {
    await plantCode(A.ids["אבא"], "deviceMove", "424242");
    const phone = await newPhone();
    expect(await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "email", secretCode: "111111", device: "n" })).toMatchObject({ ok: false, reason: "secretCode" });
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "email", secretCode: "424242", device: "n" });
    expect(start.ok).toBe(true);
    // כרטיס שגוי לא עובד
    await expect(t.mutation(api.deviceMove.moveFinish, { ticket: "x".repeat(64), ...(await keyPayload(phone, start.challenge)) })).rejects.toThrow();
    const fin: any = await t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(phone, start.challenge)) });
    expect(fin.ok).toBe(true);
    expect(await sessionsOf(A.ids["אבא"])).toHaveLength(1); // רק הסשן החדש
    expect(await t.query(api.data.get, { token: fin.token })).not.toBeNull();
    expect(await t.query(api.data.get, { token: A.tokens["אבא"] })).toBeNull(); // הסשן של המכשיר הישן נמחק
    // המכשיר הישן לא נכנס יותר, החדש כן
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], dad, "o"), "o")).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], phone, "n"), "n")).toMatchObject({ ok: true });
  });

  it("הכרטיס חד-פעמי ופג תוקף", async () => {
    await plantCode(A.ids["אבא"], "deviceMove", "424242");
    const phone = await newPhone();
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "email", secretCode: "424242", device: "n" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(phone, start.challenge)) })).rejects.toThrow();
  });
});

describe("מכשיר שאבד: בקשה עם המתנה של 24 שעות", () => {
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); await verifyEmail(A.ids["אבא"]); });

  async function request(device = "n") {
    const r: any = await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device });
    expect(r.ok).toBe(true);
    await plantCode(A.ids["אבא"], "deviceMove", "777777");
    return await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", emailCode: "777777", device });
  }

  it("אי אפשר להשלים לפני שעברו 24 שעות, ואחריהן אפשר", async () => {
    const c: any = await request();
    expect(c.ok).toBe(true);
    expect(await t.mutation(api.deviceMove.recoveryFinish, { code: CODE, personId: A.ids["אבא"], pin: "1111", secret: c.secret, device: "n" })).toMatchObject({ ok: false, reason: "wait" });
    vi.advanceTimersByTime(RECOVERY_WAIT_MS + 1000);
    const fin: any = await t.mutation(api.deviceMove.recoveryFinish, { code: CODE, personId: A.ids["אבא"], pin: "1111", secret: c.secret, device: "n" });
    expect(fin.ok).toBe(true);
    const phone = await newDevice("dad-new");
    const done: any = await t.mutation(api.deviceMove.moveFinish, { ticket: fin.ticket, ...(await keyPayload(phone, fin.challenge)) });
    expect(done.ok).toBe(true);
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], phone, "n"), "n")).toMatchObject({ ok: true });
  });

  it("בלי הסוד שנשמר במכשיר שהגיש את הבקשה אי אפשר להשלים", async () => {
    await request();
    vi.advanceTimersByTime(RECOVERY_WAIT_MS + 1000);
    expect(await t.mutation(api.deviceMove.recoveryFinish, { code: CODE, personId: A.ids["אבא"], pin: "1111", secret: "f".repeat(64), device: "x" })).toMatchObject({ ok: false, reason: "none" });
  });

  it("ההורה רואה את הבקשה ויכול לבטל, וילד לא יכול", async () => {
    const c: any = await request();
    const pending: any = await t.query(api.deviceMove.pendingMoves, { token: A.tokens["אבא"] });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ name: "אבא", mine: true });
    await expect(t.mutation(api.deviceMove.cancelRecovery, { token: A.tokens["דנה"], personId: A.ids["אבא"] })).rejects.toThrow();
    await t.mutation(api.deviceMove.cancelRecovery, { token: A.tokens["אבא"], personId: A.ids["אבא"] });
    vi.advanceTimersByTime(RECOVERY_WAIT_MS + 1000);
    expect(await t.mutation(api.deviceMove.recoveryFinish, { code: CODE, personId: A.ids["אבא"], pin: "1111", secret: c.secret, device: "n" })).toMatchObject({ ok: false, reason: "none" });
  });

  it("בלי מייל מאומת אי אפשר להגיש בקשה", async () => {
    await t.run(async (ctx) => { await ctx.db.patch(A.ids["אבא"], { emailVerified: false }); });
    expect(await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device: "n" })).toMatchObject({ ok: false, reason: "noEmail" });
  });

  it("קוד סודי שגוי ממכשיר זר מוגבל ולא נועל את ההורה", async () => {
    for (let i = 0; i < 8; i++) await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "0000", device: "attacker" });
    const p: any = await t.run((ctx) => ctx.db.get(A.ids["אבא"]));
    expect(p.lockedUntil).toBeUndefined();
  });
});

describe("קישור ראשון", () => {
  it("הורה בלי מכשיר קשור, במשפחה בלי הורה קשור, נכנס ומתבקש לקשור (needBind)", async () => {
    expect(await login(A.ids["אבא"], "1111")).toMatchObject({ ok: true, needBind: true });
  });

  it("הורה עם מייל מאומת חייב קוד מהמייל גם לקישור הראשון", async () => {
    await verifyEmail(A.ids["אבא"]);
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111" })).toMatchObject({ ok: false, reason: "needEmailCode" });
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111", emailCode: "000000" })).toMatchObject({ ok: false, reason: "emailCode" });
    await plantCode(A.ids["אבא"], "deviceMove", "123123");
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111", emailCode: "123123" })).toMatchObject({ ok: true });
  });

  it("ילד לא יכול לקשור מכשיר", async () => {
    await expect(t.mutation(api.biometric.registerStart, { token: A.tokens["דנה"], myPin: "2222" })).rejects.toThrow();
  });
});

describe("deviceStatus", () => {
  it("מדווח אם ההורה קשור ואם הוא יכול להיקשר בעצמו", async () => {
    expect(await t.query(api.biometric.deviceStatus, { token: A.tokens["אבא"] })).toMatchObject({ bound: false, canBindSelf: true });
    await firstBind("אבא", dad, "1111");
    expect(await t.query(api.biometric.deviceStatus, { token: A.tokens["אבא"] })).toMatchObject({ bound: true });
    expect(await t.query(api.biometric.deviceStatus, { token: A.tokens["אמא"] })).toMatchObject({ bound: false, canBindSelf: false });
  });
});
