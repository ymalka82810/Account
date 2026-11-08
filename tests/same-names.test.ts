// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, T } from "./helpers/seed";

let t: T;
beforeEach(() => { vi.useFakeTimers(); t = newDb(); });
afterEach(async () => { await t.finishAllScheduledFunctions(vi.runAllTimers); vi.useRealTimers(); });

describe("משפחות עם אותו שם", () => {
  const args = { familyName: "משפחת מלכא", name: "יוחאי", pin: "123456", birthDate: "1980-01-01", device: "d1" };

  it("שתי משפחות באותו שם יכולות שתיהן לכלול ילד באותו שם", async () => {
    const a = await t.mutation(api.auth.createFamily, args);
    await t.mutation(api.people.add, { token: a.token, name: "בצלאל", role: "child" });
    const b = await t.mutation(api.auth.createFamily, args);
    await t.mutation(api.people.add, { token: b.token, name: "בצלאל", role: "child" });
  });

  it("בתוך אותה משפחה השם עדיין ייחודי", async () => {
    const a = await t.mutation(api.auth.createFamily, args);
    await t.mutation(api.people.add, { token: a.token, name: "בצלאל", role: "child" });
    await expect(t.mutation(api.people.add, { token: a.token, name: "בצלאל", role: "child" })).rejects.toThrow("כבר יש מישהו בשם הזה");
  });
});
