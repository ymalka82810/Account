import { mutation, query, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { avatarOf, getSessionPerson, hashToken, isAdmin } from "./lib";

// ---------- לוח מנהל (זמני, לתקופת הפיתוח) ----------
// מי שחיבר לעצמו (בכל תפקיד, בכל משפחה) חשבון גוגל שהמייל שלו ברשימת המנהלים, רואה מכאן את כל המערכת
// במקום אחד, בלי לעבור בין הורה לילד: כל המשפחות, כל האנשים, החובות, החברויות ויומן השינויים.
// קריאה בלבד: אין כאן שום פעולה שמשנה נתונים.
// מנהל יכול גם לעבור בין תצוגת הורה, נער/ה וילד/ה (viewAs) במשפחה שבה הוא נמצא, בלי לשנות את התפקיד האמיתי שלו.
// רשימת המנהלים ו-isAdmin נמצאים ב-lib.ts (getSessionPerson צריך אותם).
export { adminEmails, isAdmin } from "./lib";

// מעבר בין תצוגות: role = parent / teen / child, או null לחזרה לתפקיד האמיתי. משפיע רק על הסשן הזה.
export const viewAs = mutation({
  args: { token: v.string(), role: v.union(v.literal("parent"), v.literal("teen"), v.literal("child"), v.null()) },
  handler: async (ctx, { token, role }) => {
    const hash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("tokenHash", hash)).first();
    if (!session || session.expiresAt < Date.now()) throw new ConvexError("צריך להיכנס מחדש");
    const p = await ctx.db.get(session.personId);
    if (!isAdmin(p)) throw new ConvexError("אין הרשאת מנהל");
    await ctx.db.patch(session._id, { viewAs: role && role !== p!.role ? role : undefined });
    return { ok: true as const };
  },
});

async function requireAdmin(ctx: QueryCtx, token: string): Promise<Doc<"people">> {
  const me = await getSessionPerson(ctx, token);
  if (!isAdmin(me)) throw new ConvexError("אין הרשאת מנהל");
  return me!;
}

const personRow = async (ctx: QueryCtx, p: Doc<"people">) => ({
  id: p._id, name: p.name, role: p.role, avatar: avatarOf(p) ?? null,
  hasPin: !!p.pinHash, freeEntry: !!p.freeEntry,
  google: p.googleSub ? (p.email ?? "") : null,
  locked: !!p.lockedUntil && p.lockedUntil > Date.now(),
  devices: (await ctx.db.query("bioKeys").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()).length,
  friendsEnabled: !!p.friendsEnabled,
  notebookShared: !!p.notebookShared,
});

// כל המשפחות במבט אחד: חברים, ספירות והתאריכים העיקריים.
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdmin(ctx, token);
    const families = await ctx.db.query("families").collect();
    const out = [];
    for (const f of families) {
      const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", f._id)).collect();
      const entries = await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", f._id)).collect();
      const joins = await ctx.db.query("joinRequests").withIndex("by_family", (q) => q.eq("familyId", f._id)).collect();
      out.push({
        id: f._id, name: f.name, code: f.childCode, country: f.country ?? null, currency: f.currency ?? null, createdAt: f.createdAt,
        people: await Promise.all(people.map((p) => personRow(ctx, p))),
        entries: entries.length,
        pending: entries.filter((e) => e.status === "pending").length,
        joinRequests: joins.length,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    const orphans = (await ctx.db.query("people").collect()).filter((p) => !p.familyId);
    return {
      families: out,
      orphans: await Promise.all(orphans.map((p) => personRow(ctx, p))),
      totals: {
        families: families.length,
        people: out.reduce((n, f) => n + f.people.length, 0) + orphans.length,
        sessions: (await ctx.db.query("sessions").collect()).filter((s) => s.expiresAt > Date.now()).length,
        friendships: (await ctx.db.query("friendships").collect()).length,
        friendEntries: (await ctx.db.query("friendEntries").collect()).length,
      },
    };
  },
});

const ENTRY_LIMIT = 300;
const ACTIVITY_LIMIT = 100;

// משפחה אחת בפירוט: אנשים, רשומות (עם שמות), דמי כיס, יעדים, חברויות של בני הנוער ויומן השינויים.
export const family = query({
  args: { token: v.string(), familyId: v.id("families") },
  handler: async (ctx, { token, familyId }) => {
    await requireAdmin(ctx, token);
    const f = await ctx.db.get(familyId);
    if (!f) throw new ConvexError("המשפחה לא נמצאה");
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    const names = new Map<Id<"people">, string>(people.map((p) => [p._id, p.name]));
    const nameOf = async (id: Id<"people">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.name ?? "?");
      return names.get(id)!;
    };
    const entries = (await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect())
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, ENTRY_LIMIT);
    const friendRows: Doc<"friendEntries">[] = [];
    for (const p of people.filter((x) => x.role === "teen")) {
      for (const idx of ["by_from", "by_to"] as const) {
        for (const e of await ctx.db.query("friendEntries").withIndex(idx, (q) => (q as any).eq(idx === "by_from" ? "from" : "to", p._id)).collect()) {
          if (!friendRows.some((r) => r._id === e._id)) friendRows.push(e);
        }
      }
    }
    const activity = await ctx.db.query("activity").withIndex("by_family_at", (q) => q.eq("familyId", familyId)).order("desc").take(ACTIVITY_LIMIT);
    const notebooks = [];
    for (const p of people) {
      const nb = await ctx.db.query("notebooks").withIndex("by_person", (q) => q.eq("personId", p._id)).collect();
      for (const n of nb) if (n.familyId === familyId) notebooks.push({ person: p.name, updatedAt: n.updatedAt, size: n.data.length });
    }
    const entryRow = async (e: Doc<"entries"> | Doc<"friendEntries">) => ({
      id: e._id, kind: e.kind, from: await nameOf(e.from), to: await nameOf(e.to), amount: e.amount, currency: e.currency ?? null,
      note: e.note, date: e.date, pending: e.status === "pending", archived: "archived" in e && !!e.archived,
      by: e.createdBy ? await nameOf(e.createdBy) : null,
    });
    return {
      id: f._id, name: f.name, code: f.childCode, currency: f.currency ?? null, country: f.country ?? null,
      people: await Promise.all(people.map((p) => personRow(ctx, p))),
      entries: await Promise.all(entries.map(entryRow)),
      friendEntries: await Promise.all(friendRows.map(entryRow)),
      recurring: await Promise.all((await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect())
        .map(async (r) => ({ id: r._id, from: await nameOf(r.from), to: await nameOf(r.to), amount: r.amount, currency: r.currency ?? null, frequency: r.frequency, nextDate: r.nextDate }))),
      goals: await Promise.all((await ctx.db.query("goals").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect())
        .map(async (g) => ({ id: g._id, person: await nameOf(g.personId), name: g.name, target: g.target, currency: g.currency ?? null }))),
      notebooks,
      activity: activity.map((a) => ({ id: a._id, kind: a.kind, actor: a.actorName, from: a.from ?? null, to: a.to ?? null, subject: a.subject ?? null, amount: a.amount ?? null, currency: a.currency ?? null, at: a.at })),
    };
  },
});
