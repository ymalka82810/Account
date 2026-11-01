// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { newDb, seedFamily, T } from "./helpers/seed";

const date = "2026-01-15";
let t: T;
let A: Awaited<ReturnType<typeof seedFamily>>;
let B: Awaited<ReturnType<typeof seedFamily>>;
const dad = () => A.tokens["אבא"];
const kid = () => A.tokens["דנה"];

beforeEach(async () => {
  vi.useFakeTimers();
  t = newDb();
  A = await seedFamily(t, "A", [{ name: "אבא", role: "parent" }, { name: "אמא", role: "parent" }, { name: "דנה", role: "child" }]);
  B = await seedFamily(t, "B", [{ name: "סבתא", role: "parent" }, { name: "דנה", role: "child" }]);
});

afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
});

const share = (id: any) => t.run(async (ctx) => { await ctx.db.patch(id, { notebookShared: true }); });
const nb = JSON.stringify({ currency: "ILS", entries: [{ id: "1", dir: "iowe", name: "סבא", amount: 5000, note: "", date, paid: false }] });
const log = async (token = dad()) => (await t.query(api.activity.list, { token })) as any[];
// אישור קוד סודי לפעולות add/role (כמו biometric:pinConfirm), בלי ביומטרי אמיתי
const pinProof = async (personId: any, action: string) => {
  await t.run((ctx) => ctx.db.insert("bioChallenges", { personId, action: "pin:" + action, challenge: "c-" + action, expiresAt: Date.now() + 60_000 }));
  return { pinChallenge: "c-" + action } as any;
};

describe("יומן שינויים להורים", () => {
  it("חוב שהורה רושם נכנס ליומן עם מי, מה וכמה", async () => {
    await t.mutation(api.entries.add, { token: dad(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 12000, note: "הערה פרטית", date });
    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "debt_add", actor: "אבא", from: "דנה", to: "אבא", amount: 12000 });
    expect(JSON.stringify(rows)).not.toContain("הערה פרטית");
  });

  it("רשומה של ילד/ה, אישור ודחייה נרשמים בנפרד", async () => {
    const e = await t.mutation(api.entries.add, { token: kid(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 3000, note: "", date });
    await t.mutation(api.entries.approve, { token: dad(), id: e });
    const e2 = await t.mutation(api.entries.add, { token: kid(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 500, note: "", date });
    await t.mutation(api.entries.reject, { token: dad(), id: e2 });
    const kinds = (await log()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["entry_approved", "entry_pending", "entry_pending", "entry_rejected"]);
  });

  it("הוספה, שינוי שם והסרה של בן/בת משפחה נרשמים, והחלפת קוד המשפחה גם", async () => {
    const id = await t.mutation(api.people.add, { token: dad(), name: "נועם", role: "child" });
    await t.mutation(api.people.rename, { token: dad(), id, name: "נועם ב" });
    await t.mutation(api.people.remove, { token: dad(), id });
    await t.mutation(api.family.rotateCode, { token: dad() });
    const kinds = (await log()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["code_rotated", "person_add", "person_remove", "person_rename"]);
  });

  it("רק הורים קוראים את היומן, ורק של המשפחה שלהם", async () => {
    await t.mutation(api.entries.add, { token: dad(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 100, note: "", date });
    await expect(t.query(api.activity.list, { token: kid() })).rejects.toThrow();
    expect(await log(B.tokens["סבתא"])).toHaveLength(0);
  });

  it("שורות ישנות נמחקות בניקוי היומי", async () => {
    await t.mutation(api.entries.add, { token: dad(), kind: "debt", from: A.ids["דנה"], to: A.ids["אבא"], amount: 100, note: "", date });
    vi.setSystemTime(Date.now() + 200 * 24 * 60 * 60 * 1000);
    await t.mutation(internal_cleanup(), {});
    expect(await t.run((ctx) => ctx.db.query("activity").collect())).toHaveLength(0);
  });
});

describe("שקיפות והשהיה של הפנקס האישי", () => {
  beforeEach(async () => {
    await share(A.ids["דנה"]);
    await t.mutation(api.notebook.sync, { token: kid(), data: nb });
  });

  it("הילד/ה רואה אילו הורים צפו ומתי, ופתיחה חוזרת בתוך 5 דקות לא נרשמת שוב", async () => {
    expect(((await t.query(api.notebook.status, { token: kid() })) as any).viewers).toEqual([]);
    await t.mutation(api.notebook.markViewed, { token: dad(), personId: A.ids["דנה"] });
    await t.mutation(api.notebook.markViewed, { token: A.tokens["אמא"], personId: A.ids["דנה"] });
    const s: any = await t.query(api.notebook.status, { token: kid() });
    expect(s.shared).toBe(true);
    expect(s.viewers.map((v: any) => v.name).sort()).toEqual(["אבא", "אמא"]);
    expect(s.updatedAt).toBeGreaterThan(0);
    const before = (await t.run((ctx) => ctx.db.query("notebooks").first()))!.viewers!;
    vi.setSystemTime(Date.now() + 60_000);
    await t.mutation(api.notebook.markViewed, { token: dad(), personId: A.ids["דנה"] });
    expect((await t.run((ctx) => ctx.db.query("notebooks").first()))!.viewers).toEqual(before);
  });

  it("השהיה מוחקת את העותק, ההורים לא רואים כלום והסנכרון נעצר; חידוש מחזיר", async () => {
    await t.mutation(api.notebook.setPaused, { token: kid(), paused: true });
    expect(await t.run((ctx) => ctx.db.query("notebooks").collect())).toHaveLength(0);
    expect(await t.query(api.notebook.forChild, { token: dad(), personId: A.ids["דנה"] })).toBeNull();
    expect(await t.mutation(api.notebook.sync, { token: kid(), data: nb })).toEqual({ shared: false });
    expect(((await t.query(api.data.get, { token: kid() })) as any).me.notebookPaused).toBe(true);
    expect(((await t.query(api.notebook.status, { token: kid() })) as any).paused).toBe(true);

    await t.mutation(api.notebook.setPaused, { token: kid(), paused: false });
    expect(await t.mutation(api.notebook.sync, { token: kid(), data: nb })).toEqual({ shared: true });
    expect(await t.query(api.notebook.forChild, { token: dad(), personId: A.ids["דנה"] })).not.toBeNull();
  });

  it("ילד/ה שלא שיתף/ה לא יכול/ה להשהות, והורה לא יכול להשהות בשבילו/ה", async () => {
    await expect(t.mutation(api.notebook.setPaused, { token: B.tokens["דנה"], paused: true })).rejects.toThrow();
    await expect(t.mutation(api.notebook.setPaused, { token: dad(), paused: true })).rejects.toThrow();
  });

  it("אחרי שינוי תפקיד הילד/ה מקבל/ת הודעה פעם אחת, והעותק נמחק", async () => {
    await t.mutation(api.people.setRole, { token: dad(), id: A.ids["דנה"], role: "teen", proof: await pinProof(A.ids["אבא"], `role:${A.ids["דנה"]}:teen`) });
    expect(await t.run((ctx) => ctx.db.query("notebooks").collect())).toHaveLength(0);
    expect(((await t.query(api.data.get, { token: kid() })) as any).me.notebookShareEnded).toBe(true);
    await t.mutation(api.notebook.ackEnded, { token: kid() });
    expect(((await t.query(api.data.get, { token: kid() })) as any).me.notebookShareEnded).toBe(false);
  });

  it("מי שלא שיתף/ה לא מקבל/ת הודעת סיום", async () => {
    await t.mutation(api.people.setRole, { token: B.tokens["סבתא"], id: B.ids["דנה"], role: "teen", proof: await pinProof(B.ids["סבתא"], `role:${B.ids["דנה"]}:teen`) });
    expect(((await t.query(api.data.get, { token: B.tokens["דנה"] })) as any).me.notebookShareEnded).toBe(false);
  });
});

describe("תמיד נשאר הורה במשפחה", () => {
  it("אי אפשר להסיר או להוריד בדרגה את עצמך", async () => {
    await expect(t.mutation(api.people.remove, { token: dad(), id: A.ids["אבא"] })).rejects.toThrow();
    await expect(t.mutation(api.people.setRole, { token: dad(), id: A.ids["אבא"], role: "child" })).rejects.toThrow();
  });

  it("אחרי שהורה אחד הוסר נשאר הורה יחיד, ואי אפשר להסיר גם אותו", async () => {
    await t.mutation(api.people.remove, { token: dad(), id: A.ids["אמא"] });
    const parents = (await t.run((ctx) => ctx.db.query("people").collect())).filter((p) => String(p.familyId) === String(A.familyId) && p.role === "parent");
    expect(parents).toHaveLength(1);
    await expect(t.mutation(api.people.remove, { token: dad(), id: A.ids["אבא"] })).rejects.toThrow();
  });

  it("הגנת השרת: הסרה של ההורה האחרון נחסמת גם אם הבדיקה הראשונה עוקפת", async () => {
    const { requireAnotherParent } = await import("../convex/people");
    await expect(t.run((ctx) => requireAnotherParent(ctx as any, B.familyId, B.ids["סבתא"]))).rejects.toThrow("לפחות הורה אחד");
    await expect(t.run((ctx) => requireAnotherParent(ctx as any, A.familyId, A.ids["אבא"]))).resolves.toBeFalsy();
  });
});

import { internal } from "../convex/_generated/api";
function internal_cleanup() { return (internal as any).maintenance.cleanup; }
