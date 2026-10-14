import { mutation, query, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { SESSION_MS, cleanName, hashPin, hashToken, randomHex, requireParent, validPin } from "./lib";

const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

async function openSession(ctx: MutationCtx, personId: Id<"people">): Promise<string> {
  const token = randomHex(32);
  await ctx.db.insert("sessions", {
    personId,
    tokenHash: await hashToken(token),
    expiresAt: Date.now() + SESSION_MS,
  });
  return token;
}

async function setPin(ctx: MutationCtx, personId: Id<"people">, pin: string) {
  const pinSalt = randomHex(16);
  await ctx.db.patch(personId, {
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    failedAttempts: 0,
    lockedUntil: undefined,
  });
}

// רשימת האנשים למסך הכניסה - בלי שום מידע סודי.
export const roster = query({
  args: {},
  handler: async (ctx) => {
    const people = await ctx.db.query("people").collect();
    return people.map((p) => ({
      id: p._id, name: p.name, role: p.role, avatar: p.avatar ?? "🙂", hasPin: !!p.pinHash,
    }));
  },
});

// הקמה ראשונה: רק כשאין אף אחד במערכת. האדם הראשון הוא הורה.
export const setupFamily = mutation({
  args: { name: v.string(), avatar: v.string(), pin: v.string() },
  handler: async (ctx, { name, avatar, pin }) => {
    if ((await ctx.db.query("people").first()) !== null) throw new ConvexError("המשפחה כבר הוקמה");
    if (!validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    const id = await ctx.db.insert("people", { name: cleanName(name), role: "parent", avatar: avatar.slice(0, 8) });
    await setPin(ctx, id, pin);
    return { token: await openSession(ctx, id) };
  },
});

// הערה: שגיאת קוד מוחזרת כתוצאה (ולא נזרקת) כדי שספירת הניסיונות תישמר.
export const login = mutation({
  args: { personId: v.id("people"), pin: v.string() },
  handler: async (ctx, { personId, pin }) => {
    const p = await ctx.db.get(personId);
    if (!p || !p.pinHash || !p.pinSalt) return { ok: false as const, reason: "nopin" as const };
    const now = Date.now();
    if (p.lockedUntil && p.lockedUntil > now) {
      return { ok: false as const, reason: "locked" as const, waitSeconds: Math.ceil((p.lockedUntil - now) / 1000) };
    }
    if ((await hashPin(pin, p.pinSalt)) !== p.pinHash) {
      const fails = (p.failedAttempts ?? 0) + 1;
      if (fails >= MAX_FAILS) {
        await ctx.db.patch(personId, { failedAttempts: 0, lockedUntil: now + LOCK_MS });
        return { ok: false as const, reason: "locked" as const, waitSeconds: LOCK_MS / 1000 };
      }
      await ctx.db.patch(personId, { failedAttempts: fails });
      return { ok: false as const, reason: "wrong" as const, left: MAX_FAILS - fails };
    }
    await ctx.db.patch(personId, { failedAttempts: 0, lockedUntil: undefined });
    return { ok: true as const, token: await openSession(ctx, personId) };
  },
});

// כניסה ראשונה של מי שהורה עוד לא קבע לו/ה קוד: בוחרים קוד לעצמם.
export const claimProfile = mutation({
  args: { personId: v.id("people"), pin: v.string() },
  handler: async (ctx, { personId, pin }) => {
    const p = await ctx.db.get(personId);
    if (!p) throw new ConvexError("אדם לא קיים");
    if (p.pinHash) throw new ConvexError("כבר יש קוד לפרופיל הזה");
    if (!validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    await setPin(ctx, personId, pin);
    return { token: await openSession(ctx, personId) };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const hash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("tokenHash", hash)).first();
    if (session) await ctx.db.delete(session._id);
  },
});

export const changeMyPin = mutation({
  args: { token: v.string(), oldPin: v.string(), newPin: v.string() },
  handler: async (ctx, { token, oldPin, newPin }) => {
    const hash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("tokenHash", hash)).first();
    if (!session || session.expiresAt < Date.now()) return { ok: false as const, reason: "session" as const };
    const p = await ctx.db.get(session.personId);
    if (!p || !p.pinHash || !p.pinSalt) return { ok: false as const, reason: "session" as const };
    if (!validPin(newPin)) return { ok: false as const, reason: "format" as const };
    const now = Date.now();
    if (p.lockedUntil && p.lockedUntil > now) return { ok: false as const, reason: "locked" as const };
    if ((await hashPin(oldPin, p.pinSalt)) !== p.pinHash) {
      const fails = (p.failedAttempts ?? 0) + 1;
      await ctx.db.patch(p._id, fails >= MAX_FAILS
        ? { failedAttempts: 0, lockedUntil: now + LOCK_MS }
        : { failedAttempts: fails });
      return { ok: false as const, reason: "wrong" as const };
    }
    await setPin(ctx, p._id, newPin);
    return { ok: true as const };
  },
});

// הורה קובע קוד חדש למישהו (או מנקה אותו, והאדם יבחר קוד בעצמו).
export const resetPin = mutation({
  args: { token: v.string(), personId: v.id("people"), pin: v.optional(v.string()) },
  handler: async (ctx, { token, personId, pin }) => {
    await requireParent(ctx, token);
    const p = await ctx.db.get(personId);
    if (!p) throw new ConvexError("אדם לא קיים");
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
      await ctx.db.delete(s._id);
    }
    if (pin) {
      if (!validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
      await setPin(ctx, personId, pin);
    } else {
      await ctx.db.patch(personId, { pinHash: undefined, pinSalt: undefined, failedAttempts: 0, lockedUntil: undefined });
    }
  },
});
