import { query, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { avatarOf, getSessionPerson } from "./lib";

// ---------- לוח מנהל (זמני, לתקופת הפיתוח) ----------
// מי שחיבר לעצמו (בכל תפקיד, בכל משפחה) חשבון גוגל שהמייל שלו ברשימת המנהלים, רואה מכאן את כל המערכת
// במקום אחד, בלי לעבור בין הורה לילד: כל המשפחות, כל האנשים, החובות, החברויות ויומן השינויים.
// קריאה בלבד: אין כאן שום פעולה שמשנה נתונים.
// הרשימה: משתנה הסביבה ADMIN_EMAILS ב-Convex (מופרד בפסיקים) גובר על ברירת המחדל. "none" מכבה את הלוח.
const DEFAULT_ADMINS = ["ymalka82810@gmail.com"];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (raw === undefined || !raw.trim()) return DEFAULT_ADMINS;
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s && s !== "none");
}

// מנהל = חשבון גוגל מחובר (googleSub) שהמייל המאומת שלו ברשימה. מייל בלי חשבון גוגל לא מספיק.
export const isAdmin = (p: Doc<"people"> | null | undefined): boolean =>
  !!p && !!p.googleSub && !!p.email && adminEmails().includes(p.email);

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
