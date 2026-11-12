// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it } from "vitest";
import { issueLocalCode, verifyCode } from "../convex/authCodes";
import { CODE_MAX_ATTEMPTS, hashPin } from "../convex/lib";
import { newDb, seedFamily, T } from "./helpers/seed";

let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;

beforeEach(async () => {
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }]);
});

// קוד ידוע מראש (הקוד האמיתי אקראי ומוחזר רק למי שביקש)
const plant = (code: string, extra: object = {}) =>
  t.run(async (ctx) => ctx.db.insert("emailCodes", {
    personId: A.ids["אבא"], purpose: "pinReset", salt: "s", codeHash: await hashPin(code, "s"),
    expiresAt: Date.now() + 60_000, attempts: 0, ...extra,
  } as any));
const verify = (code: string, purpose: any = "pinReset") =>
  t.run(async (ctx) => (await verifyCode(ctx as any, A.ids["אבא"], purpose, code)) !== null);
const codes = () => t.run((ctx) => ctx.db.query("emailCodes").collect());

describe("אימות קוד חד-פעמי", () => {
  it("קוד נכון עובר פעם אחת בלבד", async () => {
    await plant("123456");
    expect(await verify("123456")).toBe(true);
    expect(await verify("123456")).toBe(false);
  });

  it("מתעלם מרווחים ומקפים שהמשתמש הקליד", async () => {
    await plant("123456");
    expect(await verify(" 123-456 ")).toBe(true);
  });

  it("קוד שגוי מעלה את מונה הניסיונות", async () => {
    await plant("123456");
    expect(await verify("000000")).toBe(false);
    expect((await codes())[0].attempts).toBe(1);
  });

  it("אחרי מספר הניסיונות המרבי גם הקוד הנכון נחסם", async () => {
    await plant("123456");
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) await verify("000000");
    expect(await verify("123456")).toBe(false);
  });

  it("קוד שפג תוקפו לא עובר", async () => {
    await plant("123456", { expiresAt: Date.now() - 1 });
    expect(await verify("123456")).toBe(false);
  });

  it("קוד של מטרה אחת לא עובר למטרה אחרת", async () => {
    await plant("123456", { purpose: "pinChange" });
    expect(await verify("123456", "pinReset")).toBe(false);
    expect(await verify("123456", "pinChange")).toBe(true);
  });

  it("קוד קצר מדי נספר כניסיון שגוי", async () => {
    await plant("123456");
    expect(await verify("12345")).toBe(false);
    expect((await codes())[0].attempts).toBe(1);
  });
});

describe("הנפקת קוד", () => {
  it("קוד חדש מחליף קוד קודם באותה מטרה בלבד", async () => {
    await plant("111111", { purpose: "pinChange" });
    const me = await t.run((ctx) => ctx.db.get(A.ids["אבא"]));
    await t.run((ctx) => issueLocalCode(ctx as any, me!, "pinReset", 60_000));
    await t.run((ctx) => issueLocalCode(ctx as any, me!, "pinReset", 60_000));
    const rows = await codes();
    expect(rows.filter((r) => r.purpose === "pinReset")).toHaveLength(1);
    expect(rows.filter((r) => r.purpose === "pinChange")).toHaveLength(1);
  });

  it("הקוד לא נשמר בטקסט גלוי", async () => {
    const me = await t.run((ctx) => ctx.db.get(A.ids["אבא"]));
    await t.run((ctx) => issueLocalCode(ctx as any, me!, "pinChange", 60_000));
    const [row] = await codes();
    expect(row.codeHash).not.toMatch(/^\d{6}$/);
    expect(Object.values(row).some((v) => typeof v === "string" && /^\d{6}$/.test(v))).toBe(false);
  });

  it("קוד מקומי (נמסר ביד) מאומת ונמחק", async () => {
    const me = await t.run((ctx) => ctx.db.get(A.ids["אבא"]));
    const code = await t.run((ctx) => issueLocalCode(ctx as any, me!, "deviceBind", 60_000));
    expect(code).toMatch(/^\d{6}$/);
    expect(await verify(code, "deviceBind")).toBe(true);
    expect(await codes()).toHaveLength(0);
  });
});
