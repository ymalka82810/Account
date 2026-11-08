import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireParent } from "./lib";

// יומן שינויים להורים: מי שינה מה ומתי. כל מי שמבצע/ת פעולה כותב/ת שורה (logActivity), והורים קוראים (list).
export const ACTIVITY_KEEP_MS = 180 * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 100;

export type ActivityKind =
  | "debt_add" | "payment_add" | "entry_pending" | "entry_approved" | "entry_rejected" | "entry_removed"
  | "person_add" | "person_remove" | "role_set" | "person_rename" | "join_approved" | "join_rejected"
  | "family_rename" | "code_rotated" | "locale_set" | "device_revoked"
  | "goal_add" | "goal_deposit" | "goal_deposit_pending" | "goal_deposit_approved" | "goal_deposit_rejected" | "goal_removed";

export async function logActivity(
  ctx: MutationCtx, actor: Doc<"people">, kind: ActivityKind,
  extra: { from?: string; to?: string; subject?: string; subjectGender?: "male" | "female"; amount?: number; currency?: string } = {},
) {
  if (!actor.familyId) return;
  await ctx.db.insert("activity", { familyId: actor.familyId, actorId: actor._id, actorName: actor.name, actorGender: actor.gender, kind, ...extra, at: Date.now() });
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token);
    const rows = await ctx.db.query("activity").withIndex("by_family_at", (q) => q.eq("familyId", me.familyId)).order("desc").take(LIST_LIMIT);
    // שורות ישנות נכתבו בלי מגדר: משלימים מהמגדר הנוכחי של מי שביצע/ה (הוא ננעל אחרי שנקבע, לכן מדויק).
    const genders = new Map<string, "male" | "female" | undefined>();
    for (const r of rows) {
      if (r.actorGender === undefined && !genders.has(r.actorId)) genders.set(r.actorId, (await ctx.db.get(r.actorId))?.gender);
    }
    // מגדר בן/בת המשפחה נקבע בדרך כלל אחרי ההוספה, אז ברגע הרישום הוא חסר: משלימים לפי השם מבני המשפחה הנוכחיים.
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    const byName = new Map(members.map((p) => [p.name, p.gender]));
    const SUBJECT_IS_PERSON = new Set(["person_add", "role_set", "person_rename"]);
    return rows.map((r) => ({
      id: r._id, kind: r.kind, actor: r.actorName, actorGender: r.actorGender ?? genders.get(r.actorId) ?? null,
      subjectGender: r.subjectGender ?? (SUBJECT_IS_PERSON.has(r.kind) && r.subject ? byName.get(r.subject) : undefined) ?? null, from: r.from ?? null, to: r.to ?? null,
      subject: r.subject ?? null, amount: r.amount ?? null, currency: r.currency ?? null, at: r.at,
    }));
  },
});
