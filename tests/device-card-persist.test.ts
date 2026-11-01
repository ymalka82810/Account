// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T, familyCode } from "./helpers/seed";
import { PASS_TTL_MS } from "../convex/lib";

// כרטיס הכניסה של משפחה נשאר במכשיר: מעבר בין משפחות לא מבקש קוד משפחה, והכרטיס לא פג אחרי חצי שנה בלי שימוש.
let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "דנה", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "אמא", role: "parent" }, { name: "דנה", role: "child" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

describe("כרטיס כניסה קבוע למשפחה", () => {
  it("כניסה עם קוד המשפחה מחזירה כרטיס ומזהה משפחה, והכרטיס פותח את אותה משפחה", async () => {
    const first: any = await t.mutation(api.auth.enter, { code: familyCode("A"), remember: true });
    expect(first.ok).toBe(true);
    expect(first.loginCode.startsWith("dev_")).toBe(true);
    expect(String(first.familyId)).toBe(String(A.familyId));
    const again: any = await t.mutation(api.auth.enter, { code: first.loginCode });
    expect(again.ok).toBe(true);
    expect(again.familyName).toBe("A");
  });

  it("לכל משפחה כרטיס משלה, והכרטיס של אחת לא פותח את השנייה", async () => {
    const a: any = await t.mutation(api.auth.enter, { code: familyCode("A"), remember: true });
    const b: any = await t.mutation(api.auth.enter, { code: familyCode("B"), remember: true });
    expect(a.loginCode).not.toBe(b.loginCode);
    expect(String((await t.mutation(api.auth.enter, { code: b.loginCode }) as any).familyId)).toBe(String(B.familyId));
  });

  it("כרטיס שלא היה בשימוש חצי שנה עדיין תקף, וכל כניסה מחדשת אותו", async () => {
    const a: any = await t.mutation(api.auth.enter, { code: familyCode("A"), remember: true });
    vi.setSystemTime(Date.now() + 400 * 24 * 60 * 60 * 1000);
    const res: any = await t.mutation(api.auth.enter, { code: a.loginCode });
    expect(res.ok).toBe(true);
    const row = await t.run(async (ctx) => (await ctx.db.query("devicePasses").collect())[0]);
    expect(row.expiresAt).toBeGreaterThan(Date.now() + PASS_TTL_MS - 1000);
  });

  it("כרטיס שהורה הסיר כבר לא פותח כלום", async () => {
    const a: any = await t.mutation(api.auth.enter, { code: familyCode("A"), remember: true });
    await t.mutation(api.auth.forgetPass, { pass: a.loginCode });
    expect(((await t.mutation(api.auth.enter, { code: a.loginCode })) as any).ok).toBe(false);
  });

  it("deviceCard מחזיר גם את מזהה המשפחה ושמה", async () => {
    const r: any = await t.mutation(api.auth.deviceCard, { token: A.tokens["דנה"] });
    expect(r.ok).toBe(true);
    expect(String(r.familyId)).toBe(String(A.familyId));
    expect(r.familyName).toBe("A");
  });
});
