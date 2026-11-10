// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import { GOOGLE_MAX_AGE_SEC, identityFromClaims } from "../convex/googleAuth";
import { newDb, seedFamily, T } from "./helpers/seed";

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
  it("חיבור ראשון עם הקוד הסודי מאמת את המייל ושומר את החשבון", async () => {
    expect(await link("אבא")).toEqual({ ok: true, email: "dad@example.com" });
    expect(await person("אבא")).toMatchObject({ email: "dad@example.com", emailVerified: true, googleSub: "g-1" });
  });
  it("בלי קוד סודי, או עם קוד שגוי, לא מחבר", async () => {
    expect(await link("אבא", { myPin: undefined })).toEqual({ ok: false, reason: "myPin" });
    expect(await link("אבא", { myPin: "0000" })).toEqual({ ok: false, reason: "myPin" });
    const dad: any = await person("אבא");
    expect(dad.emailVerified).toBeUndefined();
    expect(dad.googleSub).toBeUndefined();
  });
  it("ילד לא יכול לחבר", async () => {
    await expect(link("דני")).rejects.toThrow();
  });
  it("חשבון גוגל אחד לא מתחבר לשני הורים", async () => {
    await link("אבא");
    expect(await link("אמא", { myPin: "5678" })).toEqual({ ok: false, reason: "taken" });
  });
  it("הורה עם מייל מאומת: אותה כתובת מתחברת בלי קוד סודי, כתובת אחרת נדחית", async () => {
    await t.run((ctx) => ctx.db.patch(A.ids["אבא"], { email: "dad@example.com", emailVerified: true }));
    expect(await link("אבא", { myPin: undefined })).toEqual({ ok: true, email: "dad@example.com" });
    expect(await link("אבא", { sub: "g-2", email: "other@example.com", myPin: undefined })).toEqual({ ok: false, reason: "differentEmail" });
  });
});
