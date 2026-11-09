import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_AMOUNT, requirePerson, requireParent, requireSameFamily, type Member } from "./lib";
import { logActivity } from "./activity";
import { notify } from "./notify";
import { LEGACY_CURRENCY, fmtMoney } from "./currency";

const MAX_GOALS_PER_PERSON = 10;
const MAX_TARGET = 100_000_000; // באגורות = מיליון ש"ח
const MAX_PENDING_PER_GOAL = 20; // הפקדות שממתינות לאישור הורה
const MAX_DEPOSITS_PER_GOAL = 500; // סך כל ההפקדות ליעד (מאושרות וממתינות)

// יעדי החיסכון שהמחובר/ת רואה: הורה רואה את כל המשפחה, כל אחד אחר רק את שלו/ה.
// saved = הפקדות מאושרות. pending = הפקדות שממתינות לאישור (הילד/ה והורים רואים).
export async function goalsFor(ctx: QueryCtx, me: Doc<"people">, familyId: Id<"families">) {
  const all = await ctx.db.query("goals").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
  const mine = me.role === "parent" ? all : all.filter((g) => g.personId === me._id);
  if (mine.length === 0) return [];
  // הפקדות רק של היעדים שנראים למחובר/ת (אינדקס by_goal), לא של כל המשפחה
  return await Promise.all(mine.map(async (g) => {
    const ds = await ctx.db.query("goalDeposits").withIndex("by_goal", (q) => q.eq("goalId", g._id)).collect();
    return {
      id: g._id, personId: g.personId, name: g.name, target: g.target, currency: g.currency ?? LEGACY_CURRENCY,
      saved: ds.filter((d) => d.status !== "pending").reduce((s, d) => s + d.amount, 0),
      pending: ds.filter((d) => d.status === "pending").map((d) => ({ id: d._id, amount: d.amount, createdAt: d.createdAt })),
    };
  }));
}

const cleanAmount = (n: number) => {
  if (!Number.isInteger(n) || n <= 0 || n > MAX_AMOUNT) throw new ConvexError("סכום לא תקין");
  return n;
};

// הורה פועל כהורה רק דרך requireParent (נאכפת קשירת המכשיר). ילד/ה ונער/ה: requirePerson.
async function actor(ctx: QueryCtx, token: string): Promise<Member> {
  const me = await requirePerson(ctx, token);
  return me.role === "parent" ? await requireParent(ctx, token) : me;
}

async function ownGoal(ctx: QueryCtx, me: Member, goalId: Id<"goals">): Promise<Doc<"goals">> {
  const goal = await ctx.db.get(goalId);
  if (!goal || goal.familyId !== me.familyId) throw new ConvexError("היעד לא קיים");
  if (me.role !== "parent" && goal.personId !== me._id) throw new ConvexError("היעד לא קיים");
  return goal;
}

async function parentIds(ctx: QueryCtx, familyId: Id<"families">): Promise<Id<"people">[]> {
  const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
  return people.filter((p) => p.role === "parent").map((p) => p._id);
}

// הורה פותח יעד לכל ילד/ה או נער/ה במשפחה. ילד/ה ונער/ה פותחים רק לעצמם.
export const add = mutation({
  args: { token: v.string(), personId: v.optional(v.id("people")), name: v.string(), target: v.number() },
  handler: async (ctx, { token, personId, name, target }) => {
    const me = await actor(ctx, token);
    const owner = personId && personId !== me._id ? await requireSameFamily(ctx, me, personId) : me;
    if (owner._id !== me._id && me.role !== "parent") throw new ConvexError("רק הורים יכולים לפתוח יעד למישהו אחר");
    if (owner.role === "parent") throw new ConvexError("יעדי חיסכון הם לילדים ולנוער");
    const clean = name.trim();
    if (!clean || clean.length > 40) throw new ConvexError("שם היעד חייב להיות עד 40 תווים");
    if (!Number.isInteger(target) || target <= 0 || target > MAX_TARGET) throw new ConvexError("סכום לא תקין");
    const existing = await ctx.db.query("goals").withIndex("by_person", (q) => q.eq("personId", owner._id)).take(MAX_GOALS_PER_PERSON);
    if (existing.length >= MAX_GOALS_PER_PERSON) throw new ConvexError("יש כבר הרבה יעדים");
    const family = await ctx.db.get(me.familyId);
    const id = await ctx.db.insert("goals", {
      familyId: me.familyId, personId: owner._id, name: clean, target,
      currency: family?.currency ?? LEGACY_CURRENCY, createdAt: Date.now(),
    });
    await logActivity(ctx, me, "goal_add", { to: owner.name, subject: clean, amount: target, currency: family?.currency ?? LEGACY_CURRENCY });
    return id;
  },
});

// הפקדה מהורה נספרת מיד. הפקדה מילד/ה ממתינה לאישור הורה, וההורים מקבלים התראה.
export const deposit = mutation({
  args: { token: v.string(), goalId: v.id("goals"), amount: v.number() },
  handler: async (ctx, { token, goalId, amount }) => {
    const me = await actor(ctx, token);
    const goal = await ownGoal(ctx, me, goalId);
    cleanAmount(amount);
    const isParent = me.role === "parent";
    const ds = await ctx.db.query("goalDeposits").withIndex("by_goal", (q) => q.eq("goalId", goalId)).collect();
    if (ds.length >= MAX_DEPOSITS_PER_GOAL) throw new ConvexError("יש כבר יותר מדי הפקדות ביעד הזה");
    if (ds.filter((d) => d.status === "pending").length >= MAX_PENDING_PER_GOAL) throw new ConvexError("יש כבר הרבה הפקדות שממתינות לאישור ביעד הזה");
    if (ds.reduce((s, d) => s + (d.status === "pending" ? 0 : d.amount), 0) >= goal.target) throw new ConvexError("היעד כבר הושג");
    await ctx.db.insert("goalDeposits", {
      goalId, familyId: me.familyId, amount, createdBy: me._id, createdAt: Date.now(),
      status: isParent ? undefined : "pending",
    });
    await logActivity(ctx, me, isParent ? "goal_deposit" : "goal_deposit_pending", { to: (await ctx.db.get(goal.personId))?.name, subject: goal.name, amount, currency: goal.currency ?? LEGACY_CURRENCY });
    if (!isParent) {
      await notify(ctx, await parentIds(ctx, me.familyId), "הפקדה ליעד חיסכון 🐷", `${me.name} רוצה להוסיף ${fmtMoney(amount, goal.currency)} ליעד "${goal.name}"`, "family");
    }
  },
});

export const decide = mutation({
  args: { token: v.string(), depositId: v.id("goalDeposits"), approve: v.boolean() },
  handler: async (ctx, { token, depositId, approve }) => {
    const me = await requireParent(ctx, token);
    const d = await ctx.db.get(depositId);
    if (!d || d.familyId !== me.familyId || d.status !== "pending") return;
    const goal = await ctx.db.get(d.goalId);
    if (approve) await ctx.db.patch(depositId, { status: undefined });
    else await ctx.db.delete(depositId);
    if (goal) {
      await logActivity(ctx, me, approve ? "goal_deposit_approved" : "goal_deposit_rejected", { to: (await ctx.db.get(goal.personId))?.name, subject: goal.name, amount: d.amount, currency: goal.currency ?? LEGACY_CURRENCY });
      await notify(ctx, [goal.personId], approve ? "ההפקדה אושרה 🐷" : "ההפקדה לא אושרה",
        `${fmtMoney(d.amount, goal.currency)} ליעד "${goal.name}"`);
    }
  },
});

// הורה מוחק כל יעד. ילד/ה ונער/ה מוחקים רק את היעדים שלהם, ורק כל עוד אין בהם הפקדות שהורה אישר.
export const remove = mutation({
  args: { token: v.string(), goalId: v.id("goals") },
  handler: async (ctx, { token, goalId }) => {
    const me = await actor(ctx, token);
    const goal = await ownGoal(ctx, me, goalId).catch(() => null);
    if (!goal) return;
    const ds = await ctx.db.query("goalDeposits").withIndex("by_goal", (q) => q.eq("goalId", goalId)).collect();
    const saved = ds.reduce((s, d) => s + (d.status === "pending" ? 0 : d.amount), 0);
    if (me.role !== "parent" && saved > 0) throw new ConvexError("יעד שיש בו הפקדות מאושרות אפשר למחוק רק עם הורה");
    for (const d of ds) await ctx.db.delete(d._id);
    await ctx.db.delete(goalId);
    await logActivity(ctx, me, "goal_removed", { to: (await ctx.db.get(goal.personId))?.name, subject: goal.name, amount: saved, currency: goal.currency ?? LEGACY_CURRENCY });
  },
});

// מחיקת יעדים והפקדות: של אדם אחד (כשמסירים אותו/ה) או של כל המשפחה (כשמוחקים את הקופה).
export async function purgeGoals(ctx: MutationCtx, familyId: Id<"families">, personId?: Id<"people">) {
  const goals = await ctx.db.query("goals").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
  const doomed = new Set(goals.filter((g) => !personId || g.personId === personId).map((g) => g._id));
  if (doomed.size === 0) return;
  for (const d of await ctx.db.query("goalDeposits").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
    if (doomed.has(d.goalId)) await ctx.db.delete(d._id);
  }
  for (const id of doomed) await ctx.db.delete(id);
}
