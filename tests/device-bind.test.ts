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
  const c: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId, device, credentialId: d.alias });
  if (!c.ok) return undefined;
  return { challenge: c.challenge, credentialId: d.alias, signature: await signWith(d, c.challenge) };
}

const login = (personId: any, pin: string, proof?: any, device = "dev-x") =>
  t.mutation(api.auth.login, { code: CODE, personId, pin, device, proof });

// קוד שהשרת היה מנפיק (אחרי אימות בגוגל, או במכשיר אחר): שותלים קוד ידוע במקום.
async function plantCode(personId: any, purpose: "deviceMove" | "deviceBind" | "deviceAdd" | "deviceRecovery" | "deviceFirst" | "pinReset", code: string) {
  await t.run(async (ctx) => {
    // מוחקים קוד אמיתי שהשרת כבר הנפיק, כדי שהקוד הידוע יהיה היחיד.
    for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
      if (old.purpose === purpose) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("emailCodes", { personId, purpose, codeHash: await hashPin(code, "s"), salt: "s", expiresAt: Date.now() + 600_000, attempts: 0 });
  });
}
const linkGoogle = (id: any) => t.run(async (ctx) => { await ctx.db.patch(id, { email: "p@example.com", googleSub: "g-" + id }); });
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

  it("איפוס קוד באישור גוגל לא פותח סשן להורה קשור (הוא נכנס מהמכשיר שלו)", async () => {
    await linkGoogle(A.ids["אבא"]);
    await plantCode(A.ids["אבא"], "pinReset", "123456");
    const res: any = await t.mutation(api.googleLink.resetWithProof, { code: CODE, personId: A.ids["אבא"], proof: "123456", newPin: "5555", device: "kid" });
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
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); });
  const newPhone = async () => newDevice("dad-new");

  it("דורשת טביעת אצבע במכשיר הישן, ומציגה בו קוד החלפה", async () => {
    await expect(t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"] })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "role:x:y") })).rejects.toThrow();
    const r: any = await t.mutation(api.deviceMove.requestMoveCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "move-device") });
    expect(r).toMatchObject({ ok: true });
    expect(r.code).toMatch(/^\d{6}$/);
    const phone = await newPhone();
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: r.code, device: "n" });
    expect(start.ok).toBe(true);
    expect((await t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(phone, start.challenge)) }) as any).ok).toBe(true);
  });

  it("המכשיר החדש צריך קוד סודי וקוד ההחלפה; אחרי ההחלפה הישן נותק", async () => {
    await plantCode(A.ids["אבא"], "deviceMove", "424242");
    const phone = await newPhone();
    expect(await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "111111", device: "n" })).toMatchObject({ ok: false, reason: "secretCode" });
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "424242", device: "n" });
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
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "424242", device: "n" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(phone, start.challenge)) })).rejects.toThrow();
  });
});

describe("הוספת מכשיר נוסף להורה (בלי לנתק את הקיימים)", () => {
  let tablet: Dev;
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); tablet = await newDevice("dad-tablet"); });

  const issue = async () => (await t.mutation(api.deviceMove.issueAddCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "add-device") })) as any;
  const addTablet = async (dev: Dev, device = "tab") => {
    const issued = await issue();
    const start: any = await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: issued.code, device });
    expect(start.ok).toBe(true);
    return (await t.mutation(api.deviceMove.addDeviceFinish, { ticket: start.ticket, ...(await keyPayload(dev, start.challenge)) })) as any;
  };

  it("אחרי ההוספה שני המכשירים נכנסים, והסשן של הקיים נשאר", async () => {
    const fin = await addTablet(tablet);
    expect(fin.ok).toBe(true);
    expect(await t.query(api.data.get, { token: fin.token })).not.toBeNull();
    expect(await t.query(api.data.get, { token: A.tokens["אבא"] })).not.toBeNull();
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], dad, "d1"), "d1")).toMatchObject({ ok: true });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], tablet, "d2"), "d2")).toMatchObject({ ok: true });
    expect(await t.query(api.biometric.deviceStatus, { token: A.tokens["אבא"] })).toMatchObject({ bound: true, max: 3, devices: [{ credentialId: "dad-phone" }, { credentialId: "dad-tablet" }] });
  });

  it("כל מכשיר מקבל את האתגר של המפתח שלו, וחתימה של מכשיר זר לא עוברת", async () => {
    await addTablet(tablet);
    const c: any = await t.mutation(api.biometric.loginChallenge, { code: CODE, personId: A.ids["אבא"], device: "d2", credentialId: tablet.alias });
    expect(c.credentialId).toBe("dad-tablet");
    const forged = { challenge: c.challenge, credentialId: tablet.alias, signature: await signWith(kid, c.challenge) };
    expect(await login(A.ids["אבא"], "1111", forged, "d2")).toMatchObject({ ok: false, reason: "device" });
  });

  it("אי אפשר להנפיק קוד בלי טביעת אצבע, לילד, או עם אישור של פעולה אחרת", async () => {
    await expect(t.mutation(api.deviceMove.issueAddCode, { token: A.tokens["אבא"] })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.issueAddCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, `bind:${A.ids["אמא"]}`) })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.issueAddCode, { token: A.tokens["דנה"] })).rejects.toThrow();
  });

  it("בלי הקוד הסודי של ההורה או עם קוד שגוי לא מתקדמים", async () => {
    const issued = await issue();
    expect(await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "0000", secretCode: issued.code, device: "x" })).toMatchObject({ ok: false, reason: "wrong" });
    expect(await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: "000000", device: "x" })).toMatchObject({ ok: false, reason: "secretCode" });
  });

  it("כרטיס הוספה לא מחליף מפתחות ב-moveFinish, וכרטיס החלפה לא מוסיף ב-addDeviceFinish", async () => {
    const issued = await issue();
    const start: any = await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: issued.code, device: "tab" });
    await expect(t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(tablet, start.challenge)) })).rejects.toThrow();
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], dad, "d1"), "d1")).toMatchObject({ ok: true });
    await plantCode(A.ids["אבא"], "deviceMove", "424242");
    const mv: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "424242", device: "n" });
    await expect(t.mutation(api.deviceMove.addDeviceFinish, { ticket: mv.ticket, ...(await keyPayload(tablet, mv.challenge)) })).rejects.toThrow();
  });

  it("הקוד חד-פעמי, ואותו מכשיר לא נרשם פעמיים", async () => {
    await addTablet(tablet);
    const issued = await issue();
    const start: any = await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: issued.code, device: "tab" });
    expect(await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: issued.code, device: "tab" })).toMatchObject({ ok: false, reason: "secretCode" });
    await expect(t.mutation(api.deviceMove.addDeviceFinish, { ticket: start.ticket, ...(await keyPayload(tablet, start.challenge)) })).rejects.toThrow();
  });

  it("הקוד פג תוקף אחרי 30 דקות", async () => {
    const issued = await issue();
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", secretCode: issued.code, device: "tab" })).toMatchObject({ ok: false, reason: "secretCode" });
  });

  it("עד 3 מכשירים להורה", async () => {
    await addTablet(tablet);
    await addTablet(await newDevice("dad-browser"), "br");
    await expect(t.mutation(api.deviceMove.issueAddCode, { token: A.tokens["אבא"], proof: await prove("אבא", dad, "add-device") })).rejects.toThrow();
  });

  it("הורה שלא קשור לא יכול להוסיף מכשיר דרך הקוד", async () => {
    await plantCode(A.ids["אמא"], "deviceAdd", "555555");
    expect(await t.mutation(api.deviceMove.addDeviceStart, { code: CODE, personId: A.ids["אמא"], pin: "3333", secretCode: "555555", device: "m" })).toMatchObject({ ok: false });
  });

  it("הסרת מכשיר: דורשת טביעת אצבע, מנתקת אותו, ולא את האחרון", async () => {
    await addTablet(tablet);
    const st: any = await t.query(api.biometric.deviceStatus, { token: A.tokens["אבא"] });
    const tabId = st.devices.find((d: any) => d.credentialId === "dad-tablet").id;
    const dadId = st.devices.find((d: any) => d.credentialId === "dad-phone").id;
    await expect(t.mutation(api.deviceMove.removeDevice, { token: A.tokens["אבא"], keyId: tabId })).rejects.toThrow();
    await expect(t.mutation(api.deviceMove.removeDevice, { token: A.tokens["אבא"], keyId: tabId, proof: await prove("אבא", dad, "add-device") })).rejects.toThrow();
    expect(await t.mutation(api.deviceMove.removeDevice, { token: A.tokens["אבא"], keyId: tabId, proof: await prove("אבא", dad, `remove-device:${tabId}`) })).toMatchObject({ ok: true });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], tablet, "d2"), "d2")).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], dad, "d1"), "d1")).toMatchObject({ ok: true });
    expect(await sessionsOf(A.ids["אבא"])).toHaveLength(2); // הסשן הנוכחי + הסשן של הכניסה שהרגע נעשתה
    // המכשיר האחרון לא מוסר
    await expect(t.mutation(api.deviceMove.removeDevice, { token: A.tokens["אבא"], keyId: dadId, proof: await prove("אבא", dad, `remove-device:${dadId}`) })).rejects.toThrow();
  });

  it("הורה אחר לא יכול להסיר מכשיר של הורה", async () => {
    await addTablet(tablet);
    const st: any = await t.query(api.biometric.deviceStatus, { token: A.tokens["אבא"] });
    const tabId = st.devices.find((d: any) => d.credentialId === "dad-tablet").id;
    await expect(t.mutation(api.deviceMove.removeDevice, { token: A.tokens["אמא"], keyId: tabId })).rejects.toThrow();
  });

  it("החלפת מכשיר (במקום הוספה) עדיין מוחקת את כל המכשירים הקודמים", async () => {
    await addTablet(tablet);
    await plantCode(A.ids["אבא"], "deviceMove", "424242");
    const phone = await newDevice("dad-new");
    const start: any = await t.mutation(api.deviceMove.moveStart, { code: CODE, personId: A.ids["אבא"], pin: "1111", method: "old", secretCode: "424242", device: "n" });
    const fin: any = await t.mutation(api.deviceMove.moveFinish, { ticket: start.ticket, ...(await keyPayload(phone, start.challenge)) });
    expect(fin.ok).toBe(true);
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], dad, "o1"), "o1")).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], tablet, "o2"), "o2")).toMatchObject({ ok: false, reason: "device" });
    expect(await login(A.ids["אבא"], "1111", await loginProof(A.ids["אבא"], phone, "n"), "n")).toMatchObject({ ok: true });
  });
});

describe("מכשיר שאבד: בקשה עם המתנה של 24 שעות", () => {
  beforeEach(async () => { await firstBind("אבא", dad, "1111"); await linkGoogle(A.ids["אבא"]); });

  async function request(device = "n") {
    const r: any = await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device });
    expect(r.ok).toBe(true);
    await plantCode(A.ids["אבא"], "deviceRecovery", "777777");
    return await t.mutation(api.deviceMove.recoveryConfirm, { code: CODE, personId: A.ids["אבא"], pin: "1111", proof: "777777", device });
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

  it("בלי חשבון גוגל מחובר אי אפשר להגיש בקשה", async () => {
    await t.run(async (ctx) => { await ctx.db.patch(A.ids["אבא"], { googleSub: undefined }); });
    expect(await t.mutation(api.deviceMove.recoveryRequest, { code: CODE, personId: A.ids["אבא"], pin: "1111", device: "n" })).toMatchObject({ ok: false, reason: "noGoogle" });
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

  it("הורה שחיבר חשבון גוגל חייב אימות בגוגל גם לקישור הראשון", async () => {
    await linkGoogle(A.ids["אבא"]);
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111" })).toMatchObject({ ok: false, reason: "needGoogle" });
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111", proof: "000000" })).toMatchObject({ ok: false, reason: "proof" });
    // קוד של מטרה אחרת לא מתקבל
    await plantCode(A.ids["אבא"], "deviceMove", "123123");
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111", proof: "123123" })).toMatchObject({ ok: false, reason: "proof" });
    await plantCode(A.ids["אבא"], "deviceFirst", "123123");
    expect(await t.mutation(api.biometric.registerStart, { token: A.tokens["אבא"], myPin: "1111", proof: "123123" })).toMatchObject({ ok: true });
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
