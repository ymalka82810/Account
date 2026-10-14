import { mutation, query, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  CODE_FAIL_LIMIT, CODE_FAIL_WINDOW_MS, CREATE_FAMILY_LIMIT, CREATE_FAMILY_WINDOW_MS, MAX_FAMILY_SIZE, SESSION_MS,
  adoptLegacy, cleanFamilyName, cleanName, createFamilyDoc, findFamilyByCode, getSessionPerson, hashPin, hashToken,
  isThrottled, legacyPeople, noteHit, randomHex, requireSameFamily, requireParent, validPin,
} from "./lib";

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

const publicPerson = (p: Doc<"people">) => ({
  id: p._id, name: p.name, role: p.role, avatar: p.avatar ?? "🙂", hasPin: !!p.pinHash,
});

// הערה: שגיאות של קוד משפחה מוחזרות כתוצאה (ולא נזרקות) כדי שספירת הניסיונות תישמר.
const failCode = async (ctx: MutationCtx) => {
  await noteHit(ctx, "code-fail", CODE_FAIL_WINDOW_MS);
  return { ok: false as const, reason: "code" as const };
};
const codeThrottled = (ctx: MutationCtx) => isThrottled(ctx, "code-fail", CODE_FAIL_LIMIT, CODE_FAIL_WINDOW_MS);

// הורים מהגרסה הישנה (משפחה אחת בלי קוד). נעלם מעצמו אחרי שהורה נכנס פעם אחת.
export const legacyRoster = query({
  args: {},
  handler: async (ctx) => (await legacyPeople(ctx)).filter((p) => p.role === "parent").map(publicPerson),
});

// בדיקת קוד משפחה ורשימת בני המשפחה למסך הכניסה.
export const enter = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    if (await codeThrottled(ctx)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    if (!found) return await failCode(ctx);
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", found.family._id)).collect();
    return {
      ok: true as const,
      familyName: found.family.name,
      codeRole: found.role,
      // את קוד הילדים בלבד שומרים במכשיר, כדי שקוד הורים לא יישאר על מכשיר משותף.
      loginCode: found.family.childCode,
      people: people.map(publicPerson),
    };
  },
});

// הקמת משפחה חדשה. מי שמקים הוא ההורה הראשון.
export const createFamily = mutation({
  args: { familyName: v.string(), name: v.string(), avatar: v.string(), pin: v.string() },
  handler: async (ctx, { familyName, name, avatar, pin }) => {
    if (await isThrottled(ctx, "create-family", CREATE_FAMILY_LIMIT, CREATE_FAMILY_WINDOW_MS)) {
      throw new ConvexError("יותר מדי משפחות חדשות כרגע. נסו שוב בעוד כמה דקות");
    }
    if (!validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    const family = cleanFamilyName(familyName);
    const personName = cleanName(name);
    const familyId = await createFamilyDoc(ctx, family);
    const id = await ctx.db.insert("people", { familyId, name: personName, role: "parent", avatar: avatar.slice(0, 8) });
    await setPin(ctx, id, pin);
    await noteHit(ctx, "create-family", CREATE_FAMILY_WINDOW_MS);
    return { token: await openSession(ctx, id) };
  },
});

// הצטרפות למשפחה קיימת עם קוד. התפקיד נקבע לפי הקוד: קוד הורים או קוד ילדים.
export const join = mutation({
  args: { code: v.string(), name: v.string(), avatar: v.string(), pin: v.string() },
  handler: async (ctx, { code, name, avatar, pin }) => {
    if (await codeThrottled(ctx)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    if (!found) return await failCode(ctx);
    if (!validPin(pin)) throw new ConvexError("הקוד הסודי צריך להיות 4 ספרות");
    const clean = cleanName(name);
    const familyId = found.family._id;
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    if (members.some((p) => p.name === clean)) throw new ConvexError("כבר יש מישהו בשם הזה. בחרו אותו ברשימה, או שנו את השם");
    const id = await ctx.db.insert("people", { familyId, name: clean, role: found.role, avatar: avatar.slice(0, 8) });
    await setPin(ctx, id, pin);
    return { ok: true as const, token: await openSession(ctx, id) };
  },
});

export const login = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string() },
  handler: async (ctx, { code, personId, pin }) => {
    const p = await ctx.db.get(personId);
    if (!p) return { ok: false as const, reason: "code" as const };
    if (p.familyId) {
      if (await codeThrottled(ctx)) return { ok: false as const, reason: "throttled" as const };
      const found = code ? await findFamilyByCode(ctx, code) : null;
      if (!found || found.family._id !== p.familyId) return await failCode(ctx);
    } else if (p.role !== "parent") {
      // נתונים ישנים: רק הורה פותח את המעבר למשפחה. ילדים מקבלים קוד מההורים.
      return { ok: false as const, reason: "legacy" as const };
    }
    if (!p.pinHash || !p.pinSalt) return { ok: false as const, reason: "nopin" as const };
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
    if (!p.familyId) await adoptLegacy(ctx);
    return { ok: true as const, token: await openSession(ctx, personId) };
  },
});

// כניסה ראשונה של מי שהורה עוד לא קבע לו/ה קוד: בוחרים קוד לעצמם.
export const claimProfile = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string() },
  handler: async (ctx, { code, personId, pin }) => {
    const p = await ctx.db.get(personId);
    if (!p) throw new ConvexError("אדם לא קיים");
    if (p.pinHash) throw new ConvexError("כבר יש קוד לפרופיל הזה");
    if (!validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    if (p.familyId) {
      if (await codeThrottled(ctx)) return { ok: false as const, reason: "throttled" as const };
      const found = code ? await findFamilyByCode(ctx, code) : null;
      if (!found || found.family._id !== p.familyId) return await failCode(ctx);
      // פרופיל הורה שהוקם בלי קוד נתפס רק עם קוד הורים, כדי שילד/ה לא יהפכו להורים.
      if (p.role === "parent" && found.role !== "parent") {
        throw new ConvexError("כדי להיכנס כהורה צריך את קוד ההורים");
      }
    } else if (p.role !== "parent") {
      return { ok: false as const, reason: "legacy" as const };
    }
    await setPin(ctx, personId, pin);
    if (!p.familyId) await adoptLegacy(ctx);
    return { ok: true as const, token: await openSession(ctx, personId) };
  },
});

// הורה שכבר מחובר מהגרסה הישנה: מעביר את הקופה הקיימת למשפחה עם קודים.
export const migrateMe = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me || me.familyId || me.role !== "parent") return;
    await adoptLegacy(ctx);
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
    const me = await requireParent(ctx, token);
    await requireSameFamily(ctx, me, personId);
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
