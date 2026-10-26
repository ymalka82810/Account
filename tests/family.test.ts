// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { familyCode, newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "נועם", role: "child" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

const family = (id: any) => t.run((ctx) => ctx.db.get(id));

describe("הרשאות הורה בלבד", () => {
  it("ילד לא יכול לשנות שם, מטבע, להחליף קוד או למחוק משפחה", async () => {
    const token = A.tokens["דנה"];
    await expect(t.mutation(api.family.rename, { token, name: "חדש" })).rejects.toThrow("רק הורים");
    await expect(t.mutation(api.family.setLocale, { token, currency: "USD" })).rejects.toThrow("רק הורים");
    await expect(t.mutation(api.family.rotateCode, { token })).rejects.toThrow("רק הורים");
    await expect(t.mutation(api.family.remove, { token, confirmName: "A" })).rejects.toThrow("רק הורים");
    expect(await family(A.familyId)).toMatchObject({ name: "A", childCode: familyCode("A") });
  });

  it("בלי כניסה תקינה אי אפשר לעשות כלום", async () => {
    await expect(t.mutation(api.family.rename, { token: "nope", name: "x" })).rejects.toThrow("צריך להיכנס מחדש");
  });
});

describe("פעולות משפחה משפיעות רק על המשפחה של ההורה", () => {
  it("שינוי שם ומטבע", async () => {
    await t.mutation(api.family.rename, { token: A.tokens["אבא"], name: "  בית   כהן " });
    await t.mutation(api.family.setLocale, { token: A.tokens["אבא"], country: "US", currency: "USD" });
    expect(await family(A.familyId)).toMatchObject({ name: "בית כהן", currency: "USD", country: "US" });
    expect(await family(B.familyId)).toMatchObject({ name: "B" });
    expect((await family(B.familyId))?.currency).toBeUndefined();
  });

  it("מטבע או מדינה לא נתמכים וגם שם ריק נדחים", async () => {
    const token = A.tokens["אבא"];
    await expect(t.mutation(api.family.setLocale, { token, currency: "XXX" })).rejects.toThrow("מטבע לא נתמך");
    await expect(t.mutation(api.family.setLocale, { token, currency: "USD", country: "ZZ" })).rejects.toThrow("מדינה לא נתמכת");
    await expect(t.mutation(api.family.rename, { token, name: "   " })).rejects.toThrow("שם המשפחה לא תקין");
    await expect(t.mutation(api.family.rename, { token, name: "x".repeat(31) })).rejects.toThrow("שם המשפחה לא תקין");
  });
});

describe("החלפת קוד הצטרפות", () => {
  it("הקוד משתנה, הקוד הישן לא פותח כלום, ומי שכבר בפנים נשאר בפנים", async () => {
    const old = familyCode("A");
    const r: any = await t.mutation(api.family.rotateCode, { token: A.tokens["אבא"] });
    expect(r.loginCode).toBeUndefined();
    const fresh = (await family(A.familyId))!.childCode;
    expect(fresh).not.toBe(old);
    expect(fresh).toHaveLength(10);
    expect(await t.mutation(api.auth.enter, { code: old, device: "d" })).toMatchObject({ ok: false, reason: "code" });
    expect(await t.mutation(api.auth.enter, { code: fresh, device: "d" })).toMatchObject({ ok: true, familyName: "A" });
    expect(await t.query(api.data.get, { token: A.tokens["דנה"] })).not.toBeNull();
  });

  it("כרטיסי כניסה של מכשירים נמחקים, ואפשר לקבל כרטיס חדש למכשיר של ההורה", async () => {
    const e: any = await t.mutation(api.auth.enter, { code: familyCode("A"), device: "d", remember: true });
    const oldPass = e.loginCode as string;
    expect(oldPass).toMatch(/^dev_/);
    expect(await t.mutation(api.auth.enter, { code: oldPass, device: "d" })).toMatchObject({ ok: true });

    const r: any = await t.mutation(api.family.rotateCode, { token: A.tokens["אבא"], keepDevice: true });
    expect(r.loginCode).toMatch(/^dev_/);
    expect(await t.mutation(api.auth.enter, { code: oldPass, device: "d" })).toMatchObject({ ok: false });
    expect(await t.mutation(api.auth.enter, { code: r.loginCode, device: "d" })).toMatchObject({ ok: true });
  });

  it("החלפת קוד אצל משפחה אחת לא נוגעת במשפחה אחרת", async () => {
    const e: any = await t.mutation(api.auth.enter, { code: familyCode("B"), device: "d", remember: true });
    await t.mutation(api.family.rotateCode, { token: A.tokens["אבא"] });
    expect((await family(B.familyId))!.childCode).toBe(familyCode("B"));
    expect(await t.mutation(api.auth.enter, { code: e.loginCode, device: "d" })).toMatchObject({ ok: true, familyName: "B" });
  });
});

describe("מכשירים שזוכרים את המשפחה", () => {
  it("הורה רואה ומבטל רק מכשירים של המשפחה שלו", async () => {
    await t.mutation(api.auth.enter, { code: familyCode("A"), device: "d1", remember: true, label: "טלפון" });
    await t.mutation(api.auth.enter, { code: familyCode("B"), device: "d2", remember: true });
    const list: any[] = await t.query(api.auth.listDevices, { token: A.tokens["אבא"] });
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("טלפון");
    const bList: any[] = await t.query(api.auth.listDevices, { token: B.tokens["אמא"] });
    await expect(t.mutation(api.auth.revokeDevice, { token: A.tokens["אבא"], deviceId: bList[0].id })).rejects.toThrow("מכשיר לא קיים");
    await t.mutation(api.auth.revokeDevice, { token: A.tokens["אבא"], deviceId: list[0].id });
    expect(await t.query(api.auth.listDevices, { token: A.tokens["אבא"] })).toHaveLength(0);
    expect(await t.query(api.auth.listDevices, { token: B.tokens["אמא"] })).toHaveLength(1);
  });

  it("ילד לא רואה את רשימת המכשירים", async () => {
    await expect(t.query(api.auth.listDevices, { token: A.tokens["דנה"] })).rejects.toThrow("רק הורים");
  });

  it("כרטיס שפג תוקפו לא פותח את מסך הכניסה", async () => {
    const e: any = await t.mutation(api.auth.enter, { code: familyCode("A"), device: "d", remember: true });
    await t.run(async (ctx) => {
      for (const p of await ctx.db.query("devicePasses").collect()) await ctx.db.patch(p._id, { expiresAt: Date.now() - 1 });
    });
    expect(await t.mutation(api.auth.enter, { code: e.loginCode, device: "d" })).toMatchObject({ ok: false, reason: "code" });
  });
});

describe("מחיקת קופה", () => {
  it("דורשת את שם המשפחה המדויק, ומוחקת הכול למשפחה הזו בלבד", async () => {
    await t.mutation(api.entries.add, { token: A.tokens["אבא"], kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 500, note: "", date: "2026-01-01" });
    await t.mutation(api.entries.add, { token: B.tokens["אמא"], kind: "debt", from: B.ids["נועם"], to: B.ids["אמא"], amount: 700, note: "", date: "2026-01-01" });
    await expect(t.mutation(api.family.remove, { token: A.tokens["אבא"], confirmName: "אחר" })).rejects.toThrow("שם המשפחה לא תואם");
    await t.mutation(api.family.remove, { token: A.tokens["אבא"], confirmName: " A " });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await family(A.familyId)).toBeNull();
    expect(await t.query(api.data.get, { token: A.tokens["דנה"] })).toBeNull();
    const left = await t.run(async (ctx) => ({
      people: await ctx.db.query("people").collect(),
      entries: await ctx.db.query("entries").collect(),
    }));
    expect(left.people.map((p) => p.name).sort()).toEqual(["אמא", "נועם"].sort());
    expect(left.entries).toHaveLength(1);
    expect(left.entries[0].amount).toBe(700);
    expect(await t.query(api.data.get, { token: B.tokens["אמא"] })).not.toBeNull();
  });
});
