// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { hashPin, RECOVERY_WAIT_MS } from "../convex/lib";
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
