// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { PROOF_LIMIT } from "../convex/lib";
import { GOOGLE_MAX_AGE_SEC, identityFromClaims } from "../convex/googleAuth";
import { familyCode, newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [
    { name: "אבא", role: "parent", pin: "1234" },
    { name: "אמא", role: "parent", pin: "5678" },
    { name: "דני", role: "child" },
  ]);
});

const now = 1_800_000_000;
const good = { sub: "g-1", email: "Dad@Example.com", email_verified: true, auth_time: now - 30, firebase: { sign_in_provider: "google.com" } };
// מאחר ש-applyLink רץ אחרי שהטוקן של גוגל אומת, כאן מזינים ישר את המזהה והמייל.
const link = (who: string, over: object = {}) =>
  t.mutation(internal.googleLink.applyLink, { token: A.tokens[who], sub: "g-1", email: "dad@example.com", myPin: "1234", ...over } as any) as Promise<any>;
const person = (who: string) => t.run((ctx) => ctx.db.get(A.ids[who]));

describe("googleAuth: בדיקת תביעות הטוקן", () => {
  it("טוקן תקין מחזיר מזהה ומייל מנורמל", () => {
    expect(identityFromClaims(good, now)).toEqual({ sub: "g-1", email: "dad@example.com" });
  });
  it("מדחה כניסה שלא נעשתה עם גוגל", () => {
    expect(() => identityFromClaims({ ...good, firebase: { sign_in_provider: "password" } }, now)).toThrow();
  });
  it("מדחה מייל לא מאומת", () => {
    expect(() => identityFromClaims({ ...good, email_verified: false }, now)).toThrow();
  });
  it("מדחה כניסה ישנה מדי או עתידית", () => {
    expect(() => identityFromClaims({ ...good, auth_time: now - GOOGLE_MAX_AGE_SEC - 1 }, now)).toThrow();
    expect(() => identityFromClaims({ ...good, auth_time: now + 3600 }, now)).toThrow();
  });
  it("מדחה טוקן בלי מזהה או בלי auth_time", () => {
    expect(() => identityFromClaims({ ...good, sub: undefined }, now)).toThrow();
    expect(() => identityFromClaims({ ...good, auth_time: undefined }, now)).toThrow();
  });
});

describe("googleLink:applyLink", () => {
  it("חיבור ראשון עם הקוד הסודי שומר את החשבון והמייל שלו", async () => {
    expect(await link("אבא")).toEqual({ ok: true, email: "dad@example.com" });
    expect(await person("אבא")).toMatchObject({ email: "dad@example.com", googleSub: "g-1" });
  });
  it("בלי קוד סודי, או עם קוד שגוי, לא מחבר", async () => {
    expect(await link("אבא", { myPin: undefined })).toEqual({ ok: false, reason: "myPin" });
    expect(await link("אבא", { myPin: "0000" })).toEqual({ ok: false, reason: "myPin" });
    expect(((await person("אבא")) as any).googleSub).toBeUndefined();
  });
  it("גם ילד/ה יכול/ה לחבר (בלי קוד סודי, אם נכנס/ת בלי קוד)", async () => {
    expect(await link("דני", { myPin: undefined, sub: "g-kid", email: "kid@example.com" })).toEqual({ ok: true, email: "kid@example.com" });
    expect(await person("דני")).toMatchObject({ googleSub: "g-kid" });
  });
  it("חשבון גוגל אחד לא מתחבר לשני אנשים באותה משפחה", async () => {
    await link("אבא");
    expect(await link("אמא", { myPin: "5678" })).toEqual({ ok: false, reason: "taken" });
  });
  it("אותו חשבון גוגל מתחבר לאותו אדם בשתי משפחות, ומאשר בכל אחת בנפרד", async () => {
    const B = await seedFamily(t, "B", [{ name: "אבא2", role: "parent", pin: "4444" }, { name: "דני", role: "child" }]);
    expect(await link("דני", { myPin: undefined, sub: "g-kid", email: "kid@example.com" })).toMatchObject({ ok: true });
    const r: any = await t.mutation(internal.googleLink.applyLink, { token: B.tokens["דני"], sub: "g-kid", email: "kid@example.com" });
    expect(r).toMatchObject({ ok: true });
    const pa: any = await t.mutation(internal.googleLink.issueProof, { code: familyCode("A"), personId: A.ids["דני"], sub: "g-kid", purpose: "pinReset", device: "d" });
    const pb: any = await t.mutation(internal.googleLink.issueProof, { code: familyCode("B"), personId: B.ids["דני"], sub: "g-kid", purpose: "pinReset", device: "d" });
    expect(pa.ok && pb.ok).toBe(true);
    // קוד שהונפק במשפחה אחת לא מאפס את הרשומה במשפחה השנייה
    expect(await t.mutation(api.googleLink.resetWithProof, { code: familyCode("B"), personId: B.ids["דני"], proof: pa.proof, newPin: "9876", device: "d" })).toMatchObject({ ok: false });
  });
  it("אותו חשבון מתחבר שוב בלי קוד סודי; חשבון אחר רק עם אימות בחשבון הנוכחי", async () => {
    await link("אבא");
    expect(await link("אבא", { myPin: undefined })).toEqual({ ok: true, email: "dad@example.com" });
    expect(await link("אבא", { sub: "g-2", email: "new@example.com", myPin: "1234" })).toEqual({ ok: false, reason: "otherAccount" });
    const proof: any = await t.mutation(internal.googleLink.issueProof, { token: A.tokens["אבא"], sub: "g-1", purpose: "emailChange" });
    expect(await link("אבא", { sub: "g-2", email: "new@example.com", myPin: undefined, changeProof: proof.proof })).toEqual({ ok: true, email: "new@example.com" });
    expect(await person("אבא")).toMatchObject({ googleSub: "g-2", email: "new@example.com" });
  });
});

describe("googleLink:issueProof", () => {
  const issue = (a: object) => t.mutation(internal.googleLink.issueProof, a as any) as Promise<any>;
  beforeEach(async () => { await link("אבא"); });

  it("מנפיק קוד רק לחשבון שמחובר, ורק למטרות שמותרות", async () => {
    expect(await issue({ token: A.tokens["אבא"], sub: "g-other", purpose: "pinChange" })).toEqual({ ok: false, reason: "otherAccount" });
    expect(await issue({ token: A.tokens["אמא"], sub: "g-1", purpose: "pinChange" })).toEqual({ ok: false, reason: "noGoogle" });
    const r = await issue({ token: A.tokens["אבא"], sub: "g-1", purpose: "pinChange" });
    expect(r.proof).toMatch(/^\d{6}$/);
  });
  it("ילד/ה לא מקבל/ת קוד לפעולות של הורה", async () => {
    await link("דני", { myPin: undefined, sub: "g-kid", email: "kid@example.com" });
    expect(await issue({ token: A.tokens["דני"], sub: "g-kid", purpose: "childReset" })).toEqual({ ok: false, reason: "role" });
    expect((await issue({ token: A.tokens["דני"], sub: "g-kid", purpose: "pinChange" })).ok).toBe(true);
  });
  it("לפני כניסה: דורש קוד משפחה נכון", async () => {
    expect(await issue({ code: "WRONG1", personId: A.ids["אבא"], sub: "g-1", purpose: "pinReset", device: "d" })).toEqual({ ok: false, reason: "code" });
    expect((await issue({ code: familyCode("A"), personId: A.ids["אבא"], sub: "g-1", purpose: "pinReset", device: "d" })).ok).toBe(true);
  });
  it("הגבלת קצב לאדם", async () => {
    for (let i = 0; i < PROOF_LIMIT; i++) await issue({ token: A.tokens["אבא"], sub: "g-1", purpose: "pinChange" });
    expect(await issue({ token: A.tokens["אבא"], sub: "g-1", purpose: "pinChange" })).toEqual({ ok: false, reason: "throttled" });
  });
});

describe("שינוי ואיפוס קוד באישור גוגל", () => {
  it("מי שחיבר גוגל לא משנה קוד עם הקוד הישן, אלא באישור גוגל", async () => {
    await link("אבא");
    expect(await t.mutation(api.auth.changeMyPin, { token: A.tokens["אבא"], oldPin: "1234", newPin: "4321" })).toMatchObject({ ok: false, reason: "useGoogle" });
    expect(await t.mutation(api.googleLink.changePinWithProof, { token: A.tokens["אבא"], proof: "000000", newPin: "4321" })).toEqual({ ok: false, reason: "proof" });
    const r: any = await t.mutation(internal.googleLink.issueProof, { token: A.tokens["אבא"], sub: "g-1", purpose: "pinChange" });
    expect(await t.mutation(api.googleLink.changePinWithProof, { token: A.tokens["אבא"], proof: r.proof, newPin: "4321" })).toEqual({ ok: true });
  });
  it("ילד/ה ששכח/ה קוד מאפס/ת באישור גוגל ונכנס/ת", async () => {
    await link("דני", { myPin: undefined, sub: "g-kid", email: "kid@example.com" });
    const r: any = await t.mutation(internal.googleLink.issueProof, { code: familyCode("A"), personId: A.ids["דני"], sub: "g-kid", purpose: "pinReset", device: "d" });
    const res: any = await t.mutation(api.googleLink.resetWithProof, { code: familyCode("A"), personId: A.ids["דני"], proof: r.proof, newPin: "9876", device: "d" });
    expect(res.ok).toBe(true);
    expect(res.token).toBeTruthy();
  });
  it("הורה עם גוגל מאשר קוד חדש לילד/ה רק בגוגל", async () => {
    await link("אבא");
    expect(await t.mutation(api.auth.resetPin, { token: A.tokens["אבא"], personId: A.ids["דני"], pin: "1111", myPin: "1234" })).toMatchObject({ ok: false, reason: "needGoogle" });
    const r: any = await t.mutation(internal.googleLink.issueProof, { token: A.tokens["אבא"], sub: "g-1", purpose: "childReset" });
    expect(await t.mutation(api.auth.resetPin, { token: A.tokens["אבא"], personId: A.ids["דני"], pin: "1111", proof: r.proof })).toMatchObject({ ok: true });
  });
});

describe("לוח מנהל", () => {
  it("רק חשבון גוגל מחובר שברשימה רואה את הלוח", async () => {
    await expect(t.query(api.superAdmin.overview, { token: A.tokens["אבא"] })).rejects.toThrow("אין הרשאת מנהל");
    await link("אבא", { email: "someone@example.com" });
    await expect(t.query(api.superAdmin.overview, { token: A.tokens["אבא"] })).rejects.toThrow();
    // מייל של מנהל בלי חשבון גוגל לא מספיק
    await t.run((ctx) => ctx.db.patch(A.ids["אמא"], { email: "ymalka82810@gmail.com" }));
    await expect(t.query(api.superAdmin.overview, { token: A.tokens["אמא"] })).rejects.toThrow();
    await link("אמא", { sub: "g-admin", email: "ymalka82810@gmail.com", myPin: "5678" });
    const o: any = await t.query(api.superAdmin.overview, { token: A.tokens["אמא"] });
    expect(o.families).toHaveLength(1);
    expect(o.families[0].people.map((p: any) => p.name).sort()).toEqual(["אבא", "אמא", "דני"].sort());
    const f: any = await t.query(api.superAdmin.family, { token: A.tokens["אמא"], familyId: A.familyId });
    expect(f.people).toHaveLength(3);
    expect(((await t.query(api.data.get, { token: A.tokens["אמא"] })) as any).me.admin).toBe(true);
    expect(((await t.query(api.data.get, { token: A.tokens["אבא"] })) as any).me.admin).toBe(false);
  });
});

describe("מנהל: מעבר בין תצוגת הורה, נער/ה וילד/ה", () => {
  it("רק מנהל עובר, התפקיד מתחלף רק בסשן, והתפקיד האמיתי לא משתנה", async () => {
    await expect(t.mutation(api.superAdmin.viewAs, { token: A.tokens["דני"], role: "parent" })).rejects.toThrow("אין הרשאת מנהל");
    await link("דני", { myPin: undefined, sub: "g-admin", email: "ymalka82810@gmail.com" });
    await t.mutation(api.superAdmin.viewAs, { token: A.tokens["דני"], role: "parent" });
    const asParent: any = await t.query(api.data.get, { token: A.tokens["דני"] });
    expect(asParent.me).toMatchObject({ role: "parent", realRole: "child", admin: true });
    // פעולת הורה עובדת בלי קשירת מכשיר
    await t.mutation(api.family.rename, { token: A.tokens["דני"], name: "B" });
    await t.mutation(api.superAdmin.viewAs, { token: A.tokens["דני"], role: "teen" });
    expect(((await t.query(api.data.get, { token: A.tokens["דני"] })) as any).me.role).toBe("teen");
    await expect(t.mutation(api.family.rename, { token: A.tokens["דני"], name: "C" })).rejects.toThrow();
    expect(((await person("דני")) as any).role).toBe("child");
    // ההורים רואים אותו כילד כמו תמיד
    const dad: any = await t.query(api.data.get, { token: A.tokens["אבא"] });
    expect(dad.people.find((p: any) => p.name === "דני").role).toBe("child");
    await t.mutation(api.superAdmin.viewAs, { token: A.tokens["דני"], role: null });
    expect(((await t.query(api.data.get, { token: A.tokens["דני"] })) as any).me.role).toBe("child");
  });
});
