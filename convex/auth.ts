import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { COUNTRIES, isCurrency } from "./currency";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { verifyCode } from "./emailCodes";
import { checkBiometric, familyHasBoundParent, isBound, proofValidator } from "./biometric";
import {
  codeThrottled, failCode, CREATE_FAMILY_LIMIT, CREATE_FAMILY_WINDOW_MS, MAX_FAMILY_SIZE, SESSION_MS,
  adoptLegacy, avatarOf, cleanFamilyName, cleanName, createFamilyDoc, deviceKey, findFamilyByCode, getSessionPerson, hashPin, isPass, issuePass, passExpiry, PASS_TTL_MS,
  hashToken, isThrottled, legacyPeople, noteHit, randomHex, registerPinFail, requireAdultBirthDate, requireSameFamily, requireParent, validPin, pinRuleMessage,
  upgradePinHash, verifyPin, trustKeyOf, hitCount, guessKeys, MAX_TRUSTED_DEVICES,
  GUESS_DEVICE_LIMIT, GUESS_DEVICE_WINDOW_MS, GUESS_PERSON_LIMIT, GUESS_PERSON_WINDOW_MS,
} from "./lib";

export async function openSession(ctx: MutationCtx, personId: Id<"people">): Promise<string> {
  const token = randomHex(32);
  await ctx.db.insert("sessions", {
    personId,
    tokenHash: await hashToken(token),
    expiresAt: Date.now() + SESSION_MS,
  });
  return token;
}

// device: המכשיר שקבע את הקוד הופך למהימן; קביעה על ידי הורה (בלי device) מנקה את הרשימה.
export async function setPin(ctx: MutationCtx, personId: Id<"people">, pin: string, device?: string) {
  const pinSalt = randomHex(16);
  const trustKey = await trustKeyOf(personId, device);
  await ctx.db.patch(personId, {
    trustedDevices: trustKey ? [trustKey] : [],
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    pinLength: pin.length,
    pinPlain: undefined,
    failedAttempts: 0,
    lockedUntil: undefined,
    lockLevel: 0,
    lockCount: 0,
    lastLockAt: undefined,
  });
}

// deviceBound: הורה שקשור למכשיר. מסך הכניסה משתמש בזה כדי לדעת שצריך גם חתימה מהמכשיר.
const publicPerson = (p: Doc<"people">, bound = false) => ({
  id: p._id, name: p.name, role: p.role, avatar: avatarOf(p), gender: p.gender ?? null, hasPin: !!p.pinHash, pinLength: p.pinLength ?? 4,
  deviceBound: bound,
});
const boundParentIds = async (ctx: QueryCtx, people: Doc<"people">[]) => {
  const ids = new Set<string>();
  for (const p of people) if (p.role === "parent" && (await isBound(ctx, p._id))) ids.add(p._id);
  return ids;
};

// failCode ו-codeThrottled עברו ל-lib.ts (כדי ש-biometric.ts ישתמש בהם בלי תלות מעגלית), ומיוצאים מכאן לשימוש מודולים קיימים.
export { failCode, codeThrottled } from "./lib";

// הורים מהגרסה הישנה (משפחה אחת בלי קוד). נעלם מעצמו אחרי שהורה נכנס פעם אחת.
export const legacyRoster = query({
  args: {},
  handler: async (ctx) => (await legacyPeople(ctx)).filter((p) => p.role === "parent").map((p) => publicPerson(p)),
});

// בדיקת קוד משפחה ורשימת בני המשפחה למסך הכניסה.
// remember: המכשיר רוצה לזכור את המשפחה. אז מקבלים כרטיס כניסה (loginCode) ולא את הקוד עצמו.
export const enter = mutation({
  args: { code: v.string(), device: v.optional(v.string()), remember: v.optional(v.boolean()), label: v.optional(v.string()) },
  handler: async (ctx, { code, device, remember, label }) => {
    if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    if (!found) return await failCode(ctx, device);
    if (found.passId) {
      const now = Date.now();
      await ctx.db.patch(found.passId, { lastUsedAt: now, expiresAt: now + PASS_TTL_MS });
    }
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", found.family._id)).collect();
    return {
      ok: true as const,
      familyName: found.family.name,
      // מה שנשמר במכשיר לכניסות הבאות: כרטיס כניסה, אף פעם לא קוד ההצטרפות.
      loginCode: found.passId ? code : remember ? await issuePass(ctx, found.family._id, label) : undefined,
      people: await (async () => {
        const bound = await boundParentIds(ctx, people);
        return people.map((p) => publicPerson(p, bound.has(p._id)));
      })(),
    };
  },
});

// הקמת משפחה חדשה. מי שמקים הוא ההורה הראשון.
export const createFamily = mutation({
  args: {
    familyName: v.string(), name: v.string(), pin: v.string(),
    // תאריך לידה (YYYY-MM-DD). חובה, ורק מי שמעל גיל 18 יכול להקים קופה.
    birthDate: v.string(),
    avatar: v.optional(v.string()), gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    // מדינת המגורים (חסרה = לא ברשימה) והמטבע שלה, כפי שנבחרו בהקמה
    country: v.optional(v.string()), currency: v.optional(v.string()),
    device: v.optional(v.string()),
  },
  handler: async (ctx, { familyName, name, pin, birthDate, avatar, gender, country, currency, device }) => {
    if (await isThrottled(ctx, "create-family", CREATE_FAMILY_LIMIT, CREATE_FAMILY_WINDOW_MS)) {
      throw new ConvexError("יותר מדי משפחות חדשות כרגע. נסו שוב בעוד כמה דקות");
    }
    if (!validPin(pin, "parent")) throw new ConvexError(pinRuleMessage("parent"));
    const birth = requireAdultBirthDate(birthDate);
    if (currency !== undefined && !isCurrency(currency)) throw new ConvexError("מטבע לא נתמך");
    if (country && !(country in COUNTRIES)) throw new ConvexError("מדינה לא נתמכת");
    const family = cleanFamilyName(familyName);
    const personName = cleanName(name);
    const familyId = await createFamilyDoc(ctx, family);
    if (currency) await ctx.db.patch(familyId, { currency, country: country || undefined });
    const id = await ctx.db.insert("people", { familyId, name: personName, role: "parent", avatar: avatar?.slice(0, 8), gender, birthDate: birth });
    await setPin(ctx, id, pin, device);
    await noteHit(ctx, "create-family", CREATE_FAMILY_WINDOW_MS);
    return { token: await openSession(ctx, id) };
  },
});

// הצטרפות למשפחה קיימת עם הקוד היחיד שלה. כל מי שמצטרף/ת נכנס/ת בתור ילד/ה,
// והורה משנה תפקיד (ילד/ה, נער/ה, הורה) ב-people:setRole, באישור ביומטרי.
// צורת פנייה (מגדר) לא נבחרת בהצטרפות - זו קביעת הורה בלבד, דרך people:setGender.
export const join = mutation({
  args: {
    code: v.string(), name: v.string(), avatar: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    pin: v.string(), device: v.optional(v.string()),
  },
  handler: async (ctx, { code, name, avatar, gender, pin, device }) => {
    if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
    const found = await findFamilyByCode(ctx, code);
    if (!found) return await failCode(ctx, device);
    if (!validPin(pin)) throw new ConvexError("הקוד הסודי צריך להיות 4 ספרות");
    const clean = cleanName(name);
    const familyId = found.family._id;
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    const requests = await ctx.db.query("joinRequests").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    if (requests.length >= MAX_JOIN_REQUESTS) throw new ConvexError("יש יותר מדי בקשות הצטרפות ממתינות. בקשו מההורים לטפל בהן");
    if (members.some((p) => p.name === clean) || requests.some((r) => r.name === clean)) throw new ConvexError("כבר יש מישהו בשם הזה. בחרו אותו ברשימה, או שנו את השם");
    void gender; // נשאר בחתימה בשביל גרסאות ישנות של האפליקציה, ולא נשמר.
    // לא נכנסים מיד: הבקשה ממתינה עד שהורה מאשר (auth:approveJoin).
    const pinSalt = randomHex(16);
    await ctx.db.insert("joinRequests", {
      familyId, name: clean, avatar: avatar?.slice(0, 8), device, pinSalt, pinHash: await hashPin(pin, pinSalt), createdAt: Date.now(),
    });
    return { ok: true as const, pending: true as const };
  },
});

const MAX_JOIN_REQUESTS = 10;

// הורה מאשר בקשת הצטרפות: נוצר ילד/ה עם הקוד הסודי שהמצטרף/ת בחר/ה, ואז נכנסים כרגיל.
export const approveJoin = mutation({
  args: { token: v.string(), requestId: v.id("joinRequests") },
  handler: async (ctx, { token, requestId }) => {
    const me = await requireParent(ctx, token);
    const r = await ctx.db.get(requestId);
    if (!r || r.familyId !== me.familyId) throw new ConvexError("הבקשה לא קיימת יותר");
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    if (members.some((p) => p.name === r.name)) throw new ConvexError("כבר יש מישהו בשם הזה. דחו את הבקשה");
    const id = await ctx.db.insert("people", { familyId: r.familyId, name: r.name, role: "child", avatar: r.avatar });
    const trustKey = await trustKeyOf(id, r.device);
    await ctx.db.patch(id, { pinSalt: r.pinSalt, pinHash: r.pinHash, trustedDevices: trustKey ? [trustKey] : [] });
    await ctx.db.delete(requestId);
  },
});

export const rejectJoin = mutation({
  args: { token: v.string(), requestId: v.id("joinRequests") },
  handler: async (ctx, { token, requestId }) => {
    const me = await requireParent(ctx, token);
    const r = await ctx.db.get(requestId);
    if (!r || r.familyId !== me.familyId) return;
    await ctx.db.delete(requestId);
  },
});

// בדיקת קוד סודי ממכשיר שהאדם לא נכנס ממנו (החלפת מכשיר, שחזור). כמו בכניסה ממכשיר זר: מוגבל לפי
// (אדם, מכשיר) ובסך הכול לאדם, ולא נועל את האדם עצמו. מחזיר ok או את סיבת הכישלון.
export async function checkPinForeign(
  ctx: MutationCtx, p: Doc<"people">, pin: string, device: string | undefined,
): Promise<{ ok: true } | { ok: false; reason: "nopin" | "locked" | "wrong"; waitSeconds?: number; left?: number }> {
  if (!p.pinHash || !p.pinSalt) return { ok: false, reason: "nopin" };
  const now = Date.now();
  if (p.lockedUntil && p.lockedUntil > now) return { ok: false, reason: "locked", waitSeconds: Math.ceil((p.lockedUntil - now) / 1000) };
  const keys = guessKeys(p._id, device);
  if ((await hitCount(ctx, keys.person, GUESS_PERSON_WINDOW_MS)) >= GUESS_PERSON_LIMIT
    || (await hitCount(ctx, keys.device, GUESS_DEVICE_WINDOW_MS)) >= GUESS_DEVICE_LIMIT) {
    return { ok: false, reason: "locked", waitSeconds: GUESS_DEVICE_WINDOW_MS / 1000 };
  }
  if (!(await verifyPin(pin, p.pinSalt, p.pinHash))) {
    await noteHit(ctx, keys.person, GUESS_PERSON_WINDOW_MS);
    await noteHit(ctx, keys.device, GUESS_DEVICE_WINDOW_MS);
    const left = GUESS_DEVICE_LIMIT - (await hitCount(ctx, keys.device, GUESS_DEVICE_WINDOW_MS));
    return left <= 0 ? { ok: false, reason: "locked", waitSeconds: GUESS_DEVICE_WINDOW_MS / 1000 } : { ok: false, reason: "wrong", left };
  }
  return { ok: true };
}

// הורה שקשור למכשיר נכנס רק עם חתימה של המפתח שבמכשיר (proof, מ-biometric:loginChallenge),
// נוסף על הקוד הסודי. בלי חתימה תקפה מחזירים "device" בלי לבדוק את הקוד הסודי בכלל, כך שאי אפשר
// לנחש קוד סודי ממכשיר אחר, וגם לא ללמוד אם הוא נכון.
// הורה שעוד לא קשור: אם במשפחה כבר יש הורה קשור הוא חייב להיקשר בקוד קישור (deviceMove:bindStart);
// אם אין (הקמה, או הורה מהגרסה הקודמת) הוא נכנס, ומתבקש לקשור את המכשיר מיד (needBind).
export const login = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), device: v.optional(v.string()), proof: v.optional(proofValidator) },
  handler: async (ctx, { code, personId, pin, device, proof }) => {
    const p = await ctx.db.get(personId);
    if (!p) return { ok: false as const, reason: "code" as const };
    if (p.familyId) {
      if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
      const found = code ? await findFamilyByCode(ctx, code) : null;
      if (!found || found.family._id !== p.familyId) return await failCode(ctx, device);
    } else if (p.role !== "parent") {
      // נתונים ישנים: רק הורה פותח את המעבר למשפחה. ילדים מקבלים קוד מההורים.
      return { ok: false as const, reason: "legacy" as const };
    }
    let needBind = false;
    if (p.role === "parent" && p.familyId) {
      if (await isBound(ctx, p._id)) {
        if (!proof || !(await checkBiometric(ctx, p._id, "login", proof))) return { ok: false as const, reason: "device" as const };
      } else if (await familyHasBoundParent(ctx, p.familyId)) {
        return { ok: false as const, reason: "needBind" as const };
      } else {
        needBind = true;
      }
    }
    if (!p.pinHash || !p.pinSalt) return { ok: false as const, reason: "nopin" as const };
    const now = Date.now();
    if (p.lockedUntil && p.lockedUntil > now) {
      return { ok: false as const, reason: "locked" as const, waitSeconds: Math.ceil((p.lockedUntil - now) / 1000) };
    }
    // מכשיר מהימן: כשלונות נועלים את האדם (נעילה מדורגת). מכשיר זר: הגבלה נפרדת שלא נועלת
    // את האדם, כדי שמי שמחזיק קוד משפחה לא יוכל לנעול ילד מול המכשיר שלו.
    const trustKey = await trustKeyOf(p._id, device);
    const trusted = !!trustKey && (p.trustedDevices ?? []).includes(trustKey);
    const keys = guessKeys(p._id, device);
    if (!trusted && (
      (await hitCount(ctx, keys.person, GUESS_PERSON_WINDOW_MS)) >= GUESS_PERSON_LIMIT
      || (await hitCount(ctx, keys.device, GUESS_DEVICE_WINDOW_MS)) >= GUESS_DEVICE_LIMIT
    )) {
      return { ok: false as const, reason: "locked" as const, waitSeconds: GUESS_DEVICE_WINDOW_MS / 1000 };
    }
    if (!(await verifyPin(pin, p.pinSalt, p.pinHash))) {
      if (!trusted) {
        await noteHit(ctx, keys.person, GUESS_PERSON_WINDOW_MS);
        await noteHit(ctx, keys.device, GUESS_DEVICE_WINDOW_MS);
        const left = GUESS_DEVICE_LIMIT - (await hitCount(ctx, keys.device, GUESS_DEVICE_WINDOW_MS));
        if (left <= 0) return { ok: false as const, reason: "locked" as const, waitSeconds: GUESS_DEVICE_WINDOW_MS / 1000 };
        return { ok: false as const, reason: "wrong" as const, left };
      }
      const r = await registerPinFail(ctx, p);
      if (r.locked) {
        await ctx.scheduler.runAfter(0, internal.email.notifyLock, { personId: p._id });
        return { ok: false as const, reason: "locked" as const, waitSeconds: r.waitSeconds };
      }
      return { ok: false as const, reason: "wrong" as const, left: r.left };
    }
    // כניסה מוצלחת מאפסת את הרמה. lockCount/lastLockAt נשארים כדי שההורה יראה התראה.
    await ctx.db.patch(personId, {
      failedAttempts: 0, lockedUntil: undefined, lockLevel: 0,
      ...(trustKey && !trusted ? { trustedDevices: [...(p.trustedDevices ?? []), trustKey].slice(-MAX_TRUSTED_DEVICES) } : {}),
    });
    await upgradePinHash(ctx, p, pin);
    if (!p.familyId) await adoptLegacy(ctx);
    return { ok: true as const, token: await openSession(ctx, personId), needBind };
  },
});

// הורה משחרר נעילה של מישהו מהמשפחה (למשל אחרי ניסיונות שגויים של זרים).
export const unlockPerson = mutation({
  args: { token: v.string(), personId: v.id("people") },
  handler: async (ctx, { token, personId }) => {
    const me = await requireParent(ctx, token);
    await requireSameFamily(ctx, me, personId);
    await ctx.db.patch(personId, { failedAttempts: 0, lockedUntil: undefined, lockLevel: 0, lockCount: 0, lastLockAt: undefined });
    const row = await ctx.db.query("throttles").withIndex("by_key", (q) => q.eq("key", guessKeys(personId, undefined).person)).first();
    if (row) await ctx.db.delete(row._id);
  },
});

// כניסה ראשונה של מי שהורה עוד לא קבע לו/ה קוד: בוחרים קוד לעצמם.
export const claimProfile = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, pin, device }) => {
    const p = await ctx.db.get(personId);
    if (!p) throw new ConvexError("אדם לא קיים");
    if (p.pinHash) throw new ConvexError("כבר יש קוד לפרופיל הזה");
    if (!validPin(pin, p.role)) throw new ConvexError(pinRuleMessage(p.role));
    if (p.familyId) {
      if (await codeThrottled(ctx, device)) return { ok: false as const, reason: "throttled" as const };
      const found = code ? await findFamilyByCode(ctx, code) : null;
      if (!found || found.family._id !== p.familyId) return await failCode(ctx, device);
      // יש רק קוד אחד למשפחה, אז פרופיל הורה בלי קוד סודי לא נתפס מכאן (אחרת ילד/ה
      // היו יכולים להיכנס אליו). הורה אחר קובע לו קוד ב"קוד חדש".
      if (p.role === "parent") throw new ConvexError("הורה אחר צריך לקבוע לך קוד סודי");
    } else if (p.role !== "parent") {
      return { ok: false as const, reason: "legacy" as const };
    }
    await setPin(ctx, personId, pin, device);
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

// מי שנכנס בלי שהמכשיר שמר את המשפחה (למשל הקים אותה בעצמו) מבקש כרטיס כניסה ברגע היציאה,
// כדי שאחרי היציאה יוצג מסך הבחירה בין בני המשפחה ולא מסך הפתיחה.
export const deviceCard = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me || !me.familyId) return { ok: false as const };
    return { ok: true as const, loginCode: await issuePass(ctx, me.familyId) };
  },
});

// רשימת המכשירים שזוכרים את המשפחה (להורים). הגיבוב עצמו לא נחשף, רק מזהה הרשומה.
export const listDevices = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token);
    const now = Date.now();
    const rows = await ctx.db.query("devicePasses").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    return rows
      .filter((r) => passExpiry(r) >= now)
      .map((r) => ({ id: r._id, label: r.label ?? null, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt ?? null, expiresAt: passExpiry(r) }))
      .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));
  },
});

// הורה מבטל מכשיר מסוים: הכרטיס שלו נמחק ולא פותח יותר את מסך הכניסה.
export const revokeDevice = mutation({
  args: { token: v.string(), deviceId: v.id("devicePasses") },
  handler: async (ctx, { token, deviceId }) => {
    const me = await requireParent(ctx, token);
    const row = await ctx.db.get(deviceId);
    if (!row || row.familyId !== me.familyId) throw new ConvexError("מכשיר לא קיים");
    await ctx.db.delete(deviceId);
  },
});

// המכשיר "שוכח" את המשפחה: מוחקים את כרטיס הכניסה שלו.
export const forgetPass = mutation({
  args: { pass: v.string() },
  handler: async (ctx, { pass }) => {
    if (!isPass(pass) || pass.length > 100) return;
    const passHash = await hashToken(pass);
    const row = await ctx.db.query("devicePasses").withIndex("by_hash", (q) => q.eq("passHash", passHash)).first();
    if (row) await ctx.db.delete(row._id);
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
    if (!validPin(newPin, p.role)) return { ok: false as const, reason: "format" as const };
    // הורה עם מייל מאומת משנה קוד רק באישור קוד מהמייל (emailAuth:changePinWithCode).
    if (p.emailVerified) return { ok: false as const, reason: "useEmail" as const };
    const now = Date.now();
    if (p.lockedUntil && p.lockedUntil > now) return { ok: false as const, reason: "locked" as const };
    if (!(await verifyPin(oldPin, p.pinSalt, p.pinHash))) {
      const r = await registerPinFail(ctx, p);
      if (r.locked) await ctx.scheduler.runAfter(0, internal.email.notifyLock, { personId: p._id });
      return { ok: false as const, reason: "wrong" as const };
    }
    await setPin(ctx, p._id, newPin);
    return { ok: true as const };
  },
});

// הורה קובע קוד חדש למישהו (או מנקה אותו, והאדם יבחר קוד בעצמו).
export const resetPin = mutation({
  args: { token: v.string(), personId: v.id("people"), pin: v.optional(v.string()), emailCode: v.optional(v.string()), myPin: v.optional(v.string()) },
  handler: async (ctx, { token, personId, pin, emailCode, myPin }) => {
    const me = await requireParent(ctx, token);
    await requireSameFamily(ctx, me, personId);
    // הורה עם מייל מאומת מאשר כל קוד חדש בקוד מהמייל (emailAuth:requestChildResetCode).
    if (me.emailVerified) {
      if (!emailCode) return { ok: false as const, reason: "needEmailCode" as const };
      if (!(await verifyCode(ctx, me._id, "childReset", emailCode))) return { ok: false as const, reason: "emailCode" as const };
    } else {
      // בלי מייל מאומת: ההורה מאשר עם הקוד הסודי שלו עצמו, כדי שלא כל מי שתופס מכשיר פתוח יוכל לאפס קוד לילד.
      if (!me.pinHash || !me.pinSalt) return { ok: false as const, reason: "needMyPin" as const };
      if (!myPin) return { ok: false as const, reason: "needMyPin" as const };
      const now = Date.now();
      if (me.lockedUntil && me.lockedUntil > now) return { ok: false as const, reason: "locked" as const };
      if (!(await verifyPin(myPin, me.pinSalt, me.pinHash))) {
        const r = await registerPinFail(ctx, me);
        if (r.locked) await ctx.scheduler.runAfter(0, internal.email.notifyLock, { personId: me._id });
        return { ok: false as const, reason: "wrongMyPin" as const };
      }
      await upgradePinHash(ctx, me, myPin);
    }
    const target = await ctx.db.get(personId);
    if (!pin && target?.role === "parent") throw new ConvexError("להורה צריך לקבוע קוד (אי אפשר לאפס שיבחר לבד)");
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
      await ctx.db.delete(s._id);
    }
    if (pin) {
      if (!validPin(pin, target?.role)) throw new ConvexError(pinRuleMessage(target?.role));
      await setPin(ctx, personId, pin);
    } else {
      await ctx.db.patch(personId, { pinHash: undefined, pinSalt: undefined, pinPlain: undefined, failedAttempts: 0, lockedUntil: undefined, lockLevel: 0, lockCount: 0, lastLockAt: undefined });
    }
    return { ok: true as const };
  },
});