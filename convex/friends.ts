import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  Member, getSessionPerson, isThrottled, noteHit, normalizeEmail, requireParent, requirePerson, requireSameFamily, validEmail,
} from "./lib";
import { entryLine, entryTextFor, notify } from "./notify";

// מצב חברים: בני נוער רושמים חובות זה עם זה (גם ממשפחות שונות).
// הפעלה דורשת אישור הורה. כל רשומה ממתינה לאישור של החבר/ה השני/ה.

export const FRIEND_MAX_AMOUNT = 50_000; // באגורות = 500 ש"ח לרשומה
const MAX_FRIENDS = 30;
const UNDO_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

async function requireFriendsOn(ctx: QueryCtx, token: string): Promise<Member> {
  const me = await requirePerson(ctx, token);
  if (me.role !== "teen") throw new ConvexError("מצב חברים הוא לבני נוער בלבד");
  if (!me.friendsEnabled) throw new ConvexError("מצב חברים עוד לא אושר על ידי ההורים");
  return me;
}

async function findFriendship(ctx: QueryCtx, x: Id<"people">, y: Id<"people">): Promise<Doc<"friendships"> | null> {
  const fromX = await ctx.db.query("friendships").withIndex("by_a", (q) => q.eq("a", x)).collect();
  const hit = fromX.find((f) => f.b === y);
  if (hit) return hit;
  const fromY = await ctx.db.query("friendships").withIndex("by_a", (q) => q.eq("a", y)).collect();
  return fromY.find((f) => f.b === x) ?? null;
}

async function allFriendships(ctx: QueryCtx, personId: Id<"people">): Promise<Doc<"friendships">[]> {
  const asA = await ctx.db.query("friendships").withIndex("by_a", (q) => q.eq("a", personId)).collect();
  const asB = await ctx.db.query("friendships").withIndex("by_b", (q) => q.eq("b", personId)).collect();
  return [...asA, ...asB];
}

async function allFriendEntries(ctx: QueryCtx, personId: Id<"people">): Promise<Doc<"friendEntries">[]> {
  const out = await ctx.db.query("friendEntries").withIndex("by_from", (q) => q.eq("from", personId)).collect();
  const seen = new Set<string>(out.map((e) => e._id));
  const asTo = await ctx.db.query("friendEntries").withIndex("by_to", (q) => q.eq("to", personId)).collect();
  for (const e of asTo) if (!seen.has(e._id)) out.push(e);
  return out;
}

// מחיקת כל מה שקשור לאדם (מקריאה של הסרת אדם או מחיקת קופה).
export async function purgeFriends(ctx: MutationCtx, personId: Id<"people">): Promise<void> {
  for (const f of await allFriendships(ctx, personId)) await ctx.db.delete(f._id);
  for (const e of await allFriendEntries(ctx, personId)) await ctx.db.delete(e._id);
}

// ---------- אישור הורה למצב חברים ----------

export const requestAccess = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "teen") throw new ConvexError("מצב חברים הוא לבני נוער בלבד");
    if (me.friendsEnabled || me.friendsRequested) return;
    await ctx.db.patch(me._id, { friendsRequested: true });
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    const parents = members.filter((p) => p.role === "parent").map((p) => p._id);
    await notify(ctx, parents, "בקשה למצב חברים 🤝", `${me.name} מבקש/ת לרשום חובות עם חברים. צריך את האישור שלך.`);
  },
});

export const approveAccess = mutation({
  args: { token: v.string(), personId: v.id("people"), email: v.string() },
  handler: async (ctx, { token, personId, email }) => {
    const me = await requireParent(ctx, token);
    const teen = await requireSameFamily(ctx, me, personId);
    if (teen.role !== "teen") throw new ConvexError("מצב חברים הוא לבני נוער בלבד");
    const clean = normalizeEmail(email);
    if (!validEmail(clean)) throw new ConvexError("כתובת המייל לא תקינה");
    const taken = await ctx.db.query("people").withIndex("by_friendEmail", (q) => q.eq("friendEmail", clean)).first();
    if (taken && taken._id !== teen._id) throw new ConvexError("המייל הזה כבר בשימוש אצל מישהו אחר");
    await ctx.db.patch(teen._id, { friendsEnabled: true, friendsRequested: false, friendEmail: clean });
    await notify(ctx, [teen._id], "מצב חברים אושר ✅", "ההורים אישרו. אפשר להוסיף חברים עם המייל שלהם.");
  },
});

export const declineAccess = mutation({
  args: { token: v.string(), personId: v.id("people") },
  handler: async (ctx, { token, personId }) => {
    const me = await requireParent(ctx, token);
    const teen = await requireSameFamily(ctx, me, personId);
    if (!teen.friendsRequested) return;
    await ctx.db.patch(teen._id, { friendsRequested: false });
    await notify(ctx, [teen._id], "מצב חברים", "ההורים לא אישרו את הבקשה כרגע.");
  },
});

// הורה מכבה מצב חברים. החברויות והרשומות נשמרות אבל אי אפשר להוסיף חדשות.
export const disableAccess = mutation({
  args: { token: v.string(), personId: v.id("people") },
  handler: async (ctx, { token, personId }) => {
    const me = await requireParent(ctx, token);
    const teen = await requireSameFamily(ctx, me, personId);
    await ctx.db.patch(teen._id, { friendsEnabled: false, friendsRequested: false, friendEmail: undefined });
  },
});

// ---------- חברים ----------

// התשובה זהה בין אם המייל קיים ובין אם לא, כדי שלא יהיה אפשר לחפש מי רשום באפליקציה.
export const addFriend = mutation({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const me = await requireFriendsOn(ctx, token);
    const key = "friend-add:" + me._id;
    if (await isThrottled(ctx, key, 10, HOUR_MS)) throw new ConvexError("יותר מדי בקשות. נסו שוב מאוחר יותר");
    await noteHit(ctx, key, HOUR_MS);
    const clean = normalizeEmail(email);
    if (!validEmail(clean)) throw new ConvexError("כתובת המייל לא תקינה");
    if (clean === me.friendEmail) throw new ConvexError("זה המייל שלך");
    if ((await allFriendships(ctx, me._id)).length >= MAX_FRIENDS) throw new ConvexError("יש כבר הרבה חברים ברשימה");

    const target = await ctx.db.query("people").withIndex("by_friendEmail", (q) => q.eq("friendEmail", clean)).first();
    if (target && target._id !== me._id && target.role === "teen" && target.friendsEnabled) {
      const existing = await findFriendship(ctx, me._id, target._id);
      if (!existing) {
        await ctx.db.insert("friendships", { a: me._id, b: target._id, status: "pending", createdAt: Date.now() });
        await notify(ctx, [target._id], "בקשת חברות 🤝", `${me.name} רוצה להוסיף אותך כחבר/ה בקופה.`);
      } else if (existing.status === "pending" && existing.b === me._id) {
        // שניכם ביקשתם אחד את השני: מאשרים.
        await ctx.db.patch(existing._id, { status: "accepted" });
        await notify(ctx, [target._id], "חבר/ה חדש/ה ✅", `${me.name} אישר/ה את החברות.`);
      }
    }
    return { ok: true as const };
  },
});

export const respondFriend = mutation({
  args: { token: v.string(), friendshipId: v.id("friendships"), accept: v.boolean() },
  handler: async (ctx, { token, friendshipId, accept }) => {
    const me = await requireFriendsOn(ctx, token);
    const f = await ctx.db.get(friendshipId);
    if (!f || f.b !== me._id || f.status !== "pending") return;
    if (accept) {
      await ctx.db.patch(f._id, { status: "accepted" });
      await notify(ctx, [f.a], "חבר/ה חדש/ה ✅", `${me.name} אישר/ה את החברות.`);
    } else {
      await ctx.db.delete(f._id);
    }
  },
});

// הסרת חבר/ה. אפשר רק כשאין יתרה פתוחה ביניכם, והרשומות הישנות נשארות להיסטוריה.
export const removeFriend = mutation({
  args: { token: v.string(), friendshipId: v.id("friendships") },
  handler: async (ctx, { token, friendshipId }) => {
    const me = await requirePerson(ctx, token);
    const f = await ctx.db.get(friendshipId);
    if (!f || (f.a !== me._id && f.b !== me._id)) return;
    const other = f.a === me._id ? f.b : f.a;
    if (f.status === "accepted") {
      let bal = 0;
      for (const e of await allFriendEntries(ctx, me._id)) {
        if (e.status === "pending") continue;
        if (e.from !== other && e.to !== other) continue;
        const sign = e.kind === "debt" ? 1 : -1;
        bal += (e.from === me._id ? 1 : -1) * sign * e.amount;
      }
      if (bal !== 0) throw new ConvexError("יש יתרה פתוחה ביניכם. סגרו אותה קודם");
    }
    await ctx.db.delete(f._id);
  },
});

// ---------- חובות בין חברים ----------

export const addEntry = mutation({
  args: {
    token: v.string(),
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(),
    note: v.string(),
    date: v.string(),
  },
  handler: async (ctx, { token, ...e }) => {
    const me = await requireFriendsOn(ctx, token);
    if (e.from !== me._id && e.to !== me._id) throw new ConvexError("אפשר לרשום רק חובות שקשורים אליך");
    if (e.from === e.to) throw new ConvexError("אדם לא יכול להיות חייב לעצמו");
    if (!Number.isInteger(e.amount) || e.amount <= 0 || e.amount > FRIEND_MAX_AMOUNT) {
      throw new ConvexError("סכום לא תקין. בין חברים אפשר לרשום עד 500 ש\"ח בכל פעם");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ConvexError("תאריך לא תקין");
    const note = e.note.trim();
    if (note.length > 80) throw new ConvexError("ההערה ארוכה מדי");
    const otherId = e.from === me._id ? e.to : e.from;
    const other = await ctx.db.get(otherId);
    const fr = await findFriendship(ctx, me._id, otherId);
    if (!other || !other.friendsEnabled || !fr || fr.status !== "accepted") throw new ConvexError("אפשר לרשום רק עם חברים מאושרים");
    const key = "friend-entry:" + me._id;
    if (await isThrottled(ctx, key, 30, HOUR_MS)) throw new ConvexError("יותר מדי רישומים. נסו שוב מאוחר יותר");
    await noteHit(ctx, key, HOUR_MS);

    const id = await ctx.db.insert("friendEntries", {
      ...e, note, createdBy: me._id, createdAt: Date.now(), status: "pending" as const,
    });
    const from = e.from === me._id ? me : other;
    const to = e.to === me._id ? me : other;
    await notify(ctx, [other._id], "ממתין לאישור שלך ⏳", entryTextFor(other._id, e, { from: from.name, to: to.name, creator: me.name }));
    return id;
  },
});

async function pendingForMe(ctx: QueryCtx, token: string, id: Id<"friendEntries">) {
  const me = await requireFriendsOn(ctx, token);
  const e = await ctx.db.get(id);
  if (!e || e.status !== "pending" || e.createdBy === me._id || (e.from !== me._id && e.to !== me._id)) return null;
  return { me, e };
}

export const confirmEntry = mutation({
  args: { token: v.string(), id: v.id("friendEntries") },
  handler: async (ctx, { token, id }) => {
    const hit = await pendingForMe(ctx, token, id);
    if (!hit) return;
    await ctx.db.patch(id, { status: undefined });
    const from = await ctx.db.get(hit.e.from);
    const to = await ctx.db.get(hit.e.to);
    if (from && to) await notify(ctx, [hit.e.createdBy], "אושר ✅", entryLine(hit.e, { from: from.name, to: to.name, creator: hit.me.name }));
  },
});

export const rejectEntry = mutation({
  args: { token: v.string(), id: v.id("friendEntries") },
  handler: async (ctx, { token, id }) => {
    const hit = await pendingForMe(ctx, token, id);
    if (!hit) return;
    await ctx.db.delete(id);
    const from = await ctx.db.get(hit.e.from);
    const to = await ctx.db.get(hit.e.to);
    if (from && to) await notify(ctx, [hit.e.createdBy], "לא אושר", entryLine(hit.e, { from: from.name, to: to.name, creator: hit.me.name }));
  },
});

// מי שיצר/ה רשומה יכול/ה לבטל אותה כל עוד היא ממתינה, או ב-10 הדקות הראשונות.
export const removeEntry = mutation({
  args: { token: v.string(), id: v.id("friendEntries") },
  handler: async (ctx, { token, id }) => {
    const me = await requirePerson(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.createdBy !== me._id) return;
    if (e.status !== "pending" && Date.now() - e.createdAt >= UNDO_MS) {
      throw new ConvexError("אפשר לבטל רק ב-10 הדקות הראשונות. כדי לתקן, רשמו החזר");
    }
    await ctx.db.delete(id);
  },
});

// ---------- קריאת נתונים ----------

const entryOut = (e: Doc<"friendEntries">) => ({
  id: e._id, kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note,
  date: e.date, createdBy: e.createdBy, createdAt: e.createdAt, status: e.status ?? "approved",
});

// מידע ציבורי על חבר/ה: שם ודמות בלבד.
async function publicInfo(ctx: QueryCtx, ids: Iterable<Id<"people">>) {
  const out: Record<string, { id: Id<"people">; name: string; avatar: string }> = {};
  for (const id of ids) {
    if (out[id]) continue;
    const p = await ctx.db.get(id);
    if (p) out[id] = { id: p._id, name: p.name, avatar: p.avatar ?? "🙂" };
  }
  return out;
}

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me || !me.familyId) return null;

    if (me.role === "teen") {
      if (!me.friendsEnabled) return { kind: "teen" as const, enabled: false as const, requested: !!me.friendsRequested };
      const friendships = await allFriendships(ctx, me._id);
      const entries = await allFriendEntries(ctx, me._id);
      const ids = new Set<Id<"people">>();
      for (const f of friendships) { ids.add(f.a); ids.add(f.b); }
      for (const e of entries) { ids.add(e.from); ids.add(e.to); }
      ids.delete(me._id);
      return {
        kind: "teen" as const,
        enabled: true as const,
        requested: false,
        email: me.friendEmail ?? null,
        people: await publicInfo(ctx, ids),
        friendships: friendships.map((f) => ({
          id: f._id, other: f.a === me._id ? f.b : f.a, status: f.status, incoming: f.b === me._id,
        })),
        entries: entries.map(entryOut),
      };
    }

    if (me.role === "parent") {
      // הורים רואים (לקריאה בלבד) מה הילדים הגדולים שלהם רושמים עם חברים.
      const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId!)).collect();
      const teens = [];
      for (const t of members) {
        if (t.role !== "teen" || !t.friendsEnabled) continue;
        const friendships = (await allFriendships(ctx, t._id)).filter((f) => f.status === "accepted");
        const entries = await allFriendEntries(ctx, t._id);
        const ids = new Set<Id<"people">>();
        for (const f of friendships) { ids.add(f.a); ids.add(f.b); }
        for (const e of entries) { ids.add(e.from); ids.add(e.to); }
        const info = await publicInfo(ctx, ids);
        const nameOf = (id: Id<"people">) => info[id]?.name ?? "לא ידוע";
        teens.push({
          id: t._id,
          name: t.name,
          friends: friendships.map((f) => nameOf(f.a === t._id ? f.b : f.a)),
          entries: entries
            .sort((x, y) => y.createdAt - x.createdAt)
            .slice(0, 30)
            .map((e) => ({
              id: e._id, kind: e.kind, fromName: nameOf(e.from), toName: nameOf(e.to), amount: e.amount,
              note: e.note, date: e.date, status: e.status ?? "approved",
            })),
        });
      }
      return { kind: "parent" as const, teens };
    }

    return { kind: "child" as const };
  },
});
