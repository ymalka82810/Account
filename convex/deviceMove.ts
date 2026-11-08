import { mutation, query, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { checkPinForeign, openSession } from "./auth";
import {
  acceptKey, boundKeys, familyHasBoundParent, isBound, keyArgs, proofValidator, requireBiometric, startRegistration,
} from "./biometric";
import { issueCode, issueLocalCode, verifyCode } from "./emailCodes";
import {
  BIND_CODE_TTL_MS, MAX_PARENT_DEVICES, RECOVERY_TTL_MS, RECOVERY_WAIT_MS, TICKET_TTL_MS,
  codeThrottled, failCode, findFamilyByCode, hashToken, randomHex, requireParent, requireSameFamily,
} from "./lib";

// מכשירים של הורה (ראו biometric.ts). להורה יכולים להיות כמה מכשירים קשורים (עד MAX_PARENT_DEVICES, למשל
// האפליקציה והדפדפן), ויש שני סוגי פעולות:
//
//  א. הוספת מכשיר נוסף: המכשירים הקיימים ממשיכים לעבוד. הורה קשור מנפיק לעצמו קוד, מאשר בטביעת אצבע
//     במכשיר הקשור, ומקליד אותו במכשיר החדש יחד עם הקוד הסודי. (issueAddCode, addDeviceStart, addDeviceFinish)
//     הסרת מכשיר אחד: removeDevice.
//  ב. החלפת מכשיר (מכשיר שאבד, או מעבר טלפון): כל המפתחות הקודמים נמחקים והמכשיר החדש הוא היחיד.
//     אפשרית רק בשלוש דרכים:
//
//  1. המכשיר הישן עדיין קיים: טביעת אצבע בו + קוד שנשלח למייל המאומת, ובמכשיר החדש קוד סודי + הקוד מהמייל.
//     (requestMoveCode, moveStart, moveFinish)
//  2. הורה אחר (קשור) מחליף להורה: טביעת אצבע שלו, והוא מוסר ביד קוד קישור. זה גם הדרך לקשר הורה חדש
//     ולהורה שהטלפון שלו נהרס. (issueBindCode, bindStart, moveFinish)
//  3. המכשיר אבד ואין הורה אחר: קוד סודי + קוד מהמייל, ואז המתנה של 24 שעות שבהן ההורים מקבלים מייל
//     ויכולים לבטל. (recoveryRequest, recoveryConfirm, recoveryFinish, cancelRecovery)
//
// בכל דרכי ההחלפה הקשירה מסתיימת באותו שלב: המכשיר החדש יוצר מפתח, ו-moveFinish מחליף את המפתחות הקודמים
// (המכשירים הישנים מפסיקים לעבוד ונותקים אותם מכל הסשנים).
//
// ערוץ האימות החיצוני הוא המייל, והוא עובר רק דרך issueCode (emailCodes.ts) ו-email.ts. כשיעברו
// לחשבון גוגל מחליפים רק אותם, ושאר ההיגיון נשאר.

const hashSecret = (s: string) => hashToken("device:" + s);

type Gate =
  | { ok: true; person: Doc<"people"> }
  | { ok: false; reason: "throttled" | "code" | "nopin" | "locked" | "wrong"; waitSeconds?: number; left?: number };

// בדיקת הטיפוסים של ה-frontend לא ב-strict ואז הצמצום של union לא עובד; כך התוצאה נשארת כישלון בלבד גם שם.
type Fail = Exclude<Gate, { ok: true }>;
const asFail = (g: Gate): Fail => g as Fail;

// זהות לפני החלפת מכשיר: קוד המשפחה (או כרטיס מכשיר) והקוד הסודי של ההורה, בלי סשן.
async function gate(ctx: MutationCtx, a: { code?: string; personId: Id<"people">; pin: string; device?: string }): Promise<Gate> {
  if (await codeThrottled(ctx, a.device)) return { ok: false, reason: "throttled" };
  const p = await ctx.db.get(a.personId);
  const found = a.code ? await findFamilyByCode(ctx, a.code) : null;
  if (!p || !found || p.familyId !== found.family._id || p.role !== "parent") return await failCode(ctx, a.device);
  const r = await checkPinForeign(ctx, p, a.pin, a.device);
  return r.ok ? { ok: true, person: p } : r;
}

// כרטיס להשלמת הקישור: קודים אומתו, נשאר רק שהמכשיר החדש יצור מפתח (moveFinish, או addDeviceFinish כש-add).
async function issueTicket(ctx: MutationCtx, p: Doc<"people">, add = false) {
  for (const t of await ctx.db.query("deviceTickets").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
    await ctx.db.delete(t._id);
  }
  const ticket = randomHex(32);
  await ctx.db.insert("deviceTickets", { personId: p._id, ticketHash: await hashSecret(ticket), expiresAt: Date.now() + TICKET_TTL_MS, ...(add ? { add: true } : {}) });
  return { ok: true as const, ticket, challenge: await startRegistration(ctx, p._id), userId: p._id, name: p.name };
}

const needVerifiedEmail = (me: Doc<"people">) => {
  if (!me.emailVerified || !me.email) throw new ConvexError("צריך מייל מאומת כדי להחליף מכשיר");
  return me.email;
};

// ---------- 1. מהמכשיר הישן ----------
// קוד למייל. דורש טביעת אצבע במכשיר הישן (המפתח הקשור), כך שמי שרק יודע את הקוד הסודי לא יכול להתחיל.
export const requestMoveCode = mutation({
  args: { token: v.string(), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, proof }) => {
    const me = await requireParent(ctx, token);
    const email = needVerifiedEmail(me);
    await requireBiometric(ctx, me, "move-device", proof);
    await issueCode(ctx, me, email, "deviceMove");
    return { ok: true as const };
  },
});

// קוד למייל לקישור הראשון (הורה עם מייל מאומת שעוד לא קשור ואין במשפחה הורה קשור).
export const requestFirstCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token, { allowUnbound: true });
    if (await isBound(ctx, me._id) || await familyHasBoundParent(ctx, me.familyId)) throw new ConvexError("אי אפשר לקשור מכשיר ככה");
    await issueCode(ctx, me, needVerifiedEmail(me), "deviceMove");
    return { ok: true as const };
  },
});

// ---------- 2. קוד קישור מהורה אחר ----------
// הורה קשור מנפיק להורה אחר קוד חד-פעמי (30 דקות) שהוא מוסר לו ביד. דורש טביעת אצבע שלו, קשורה להורה הספציפי הזה.
export const issueBindCode = mutation({
  args: { token: v.string(), personId: v.id("people"), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, personId, proof }) => {
    const me = await requireParent(ctx, token);
    const target = await requireSameFamily(ctx, me, personId);
    if (target._id === me._id) throw new ConvexError("להחלפת מכשיר לעצמך יש תהליך אחר");
    if (target.role !== "parent") throw new ConvexError("קוד קישור הוא להורים בלבד");
    await requireBiometric(ctx, me, `bind:${personId}`, proof);
    return { ok: true as const, code: await issueLocalCode(ctx, target, "deviceBind", BIND_CODE_TTL_MS), name: target.name };
  },
});

// ---------- שלב משותף: במכשיר החדש ----------
// method "email": הקוד שנשלח למייל (דרך 1). method "parent": קוד הקישור של הורה אחר (דרך 2).
export const moveStart = mutation({
  args: {
    code: v.optional(v.string()), personId: v.id("people"), pin: v.string(),
    method: v.union(v.literal("email"), v.literal("parent")), secretCode: v.string(), device: v.optional(v.string()),
  },
  handler: async (ctx, { code, personId, pin, method, secretCode, device }) => {
    const g = await gate(ctx, { code, personId, pin, device });
    if (!g.ok) return asFail(g);
    const row = await verifyCode(ctx, personId, method === "email" ? "deviceMove" : "deviceBind", secretCode);
    if (!row) return { ok: false as const, reason: "secretCode" as const };
    return await issueTicket(ctx, g.person);
  },
});

// סיום: המכשיר החדש יצר מפתח. מחליף את המפתח הקודם, מנתק את כל הסשנים של ההורה ופותח סשן במכשיר החדש.
export const moveFinish = mutation({
  args: { ticket: v.string(), ...keyArgs },
  handler: async (ctx, { ticket, ...a }) => {
    if (ticket.length > 100) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    const hash = await hashSecret(ticket);
    const row = await ctx.db.query("deviceTickets").withIndex("by_hash", (q) => q.eq("ticketHash", hash)).first();
    // כרטיס להוספת מכשיר לא מחליף מפתחות: הוא נגמר רק ב-addDeviceFinish.
    if (!row || row.expiresAt < Date.now() || row.add) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    const p = await ctx.db.get(row.personId);
    if (!p || p.role !== "parent" || !p.familyId) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    await acceptKey(ctx, p._id, a);
    await ctx.db.delete(row._id);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) await ctx.db.delete(s._id);
    for (const r of await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) await ctx.db.delete(r._id);
    await ctx.scheduler.runAfter(0, internal.email.notifyDeviceChange, { personId: p._id, kind: "changed" });
    return { ok: true as const, token: await openSession(ctx, p._id) };
  },
});

// ---------- א. הוספת מכשיר נוסף ----------
// קוד להוספת מכשיר, להורה עצמו. דורש טביעת אצבע במכשיר קשור (פעולה add-device, בלי חלופת קוד סודי),
// כך שמי שרק יודע את הקוד הסודי וקוד המשפחה לא יכול להוסיף מכשיר. הקוד חד-פעמי, ובתוקף 30 דקות.
export const issueAddCode = mutation({
  args: { token: v.string(), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, proof }) => {
    const me = await requireParent(ctx, token);
    if ((await boundKeys(ctx, me._id)).length >= MAX_PARENT_DEVICES) {
      throw new ConvexError("אפשר לקשור עד " + MAX_PARENT_DEVICES + " מכשירים. הסירו מכשיר ונסו שוב.");
    }
    await requireBiometric(ctx, me, "add-device", proof);
    return { ok: true as const, code: await issueLocalCode(ctx, me, "deviceAdd", BIND_CODE_TTL_MS) };
  },
});

// במכשיר החדש: קוד המשפחה, הקוד הסודי של ההורה והקוד מהמכשיר הקשור. מחזיר כרטיס ליצירת המפתח (addDeviceFinish).
export const addDeviceStart = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), secretCode: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, pin, secretCode, device }) => {
    const g = await gate(ctx, { code, personId, pin, device });
    if (!g.ok) return asFail(g);
    if (!(await verifyCode(ctx, personId, "deviceAdd", secretCode))) return { ok: false as const, reason: "secretCode" as const };
    // הוספה אפשרית רק להורה שכבר קשור: קישור ראשון והחלפה עוברים בתהליכים שלהם.
    if (!(await isBound(ctx, personId))) return { ok: false as const, reason: "secretCode" as const };
    if ((await boundKeys(ctx, personId)).length >= MAX_PARENT_DEVICES) return { ok: false as const, reason: "full" as const };
    return await issueTicket(ctx, g.person, true);
  },
});

// סיום ההוספה: המכשיר החדש יצר מפתח. המפתחות והסשנים הקיימים נשארים, ופותחים סשן במכשיר החדש.
export const addDeviceFinish = mutation({
  args: { ticket: v.string(), ...keyArgs },
  handler: async (ctx, { ticket, ...a }) => {
    if (ticket.length > 100) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    const hash = await hashSecret(ticket);
    const row = await ctx.db.query("deviceTickets").withIndex("by_hash", (q) => q.eq("ticketHash", hash)).first();
    if (!row || row.expiresAt < Date.now() || !row.add) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    const p = await ctx.db.get(row.personId);
    if (!p || p.role !== "parent" || !p.familyId) throw new ConvexError("פג תוקף האימות. נסו שוב.");
    await acceptKey(ctx, p._id, a, { keepOthers: true });
    await ctx.db.delete(row._id);
    await ctx.scheduler.runAfter(0, internal.email.notifyDeviceChange, { personId: p._id, kind: "added" });
    return { ok: true as const, token: await openSession(ctx, p._id) };
  },
});

// הסרת מכשיר אחד של ההורה (למשל טאבלט שנמסר). דורש טביעת אצבע, ותמיד נשאר לפחות מכשיר אחד.
// כל שאר הסשנים של ההורה מתנתקים, כדי שמכשיר שהוסר לא יישאר מחובר.
export const removeDevice = mutation({
  args: { token: v.string(), keyId: v.id("bioKeys"), proof: v.optional(proofValidator) },
  handler: async (ctx, { token, keyId, proof }) => {
    const me = await requireParent(ctx, token);
    const keys = await boundKeys(ctx, me._id);
    if (!keys.some((k) => k._id === keyId)) throw new ConvexError("המכשיר לא נמצא");
    if (keys.length < 2) throw new ConvexError("אי אפשר להסיר את המכשיר האחרון. להחלפת מכשיר יש תהליך נפרד.");
    await requireBiometric(ctx, me, "remove-device:" + keyId, proof);
    await ctx.db.delete(keyId);
    const mine = await hashToken(token);
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", me._id)).collect()) {
      if (s.tokenHash !== mine) await ctx.db.delete(s._id);
    }
    return { ok: true as const };
  },
});

// ---------- 3. מכשיר שאבד ----------
// שלב א: קוד סודי נכון, ואז קוד למייל. אם אין מייל מאומת אי אפשר (הורה אחר מחליף לו, דרך 2).
export const recoveryRequest = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, pin, device }) => {
    const g = await gate(ctx, { code, personId, pin, device });
    if (!g.ok) return asFail(g);
    if (!g.person.emailVerified || !g.person.email) return { ok: false as const, reason: "noEmail" as const };
    // מטרה נפרדת מ-deviceMove: קוד שנשלח כאן לא פותח את moveStart (שמדלג על ההמתנה של 24 שעות).
    await issueCode(ctx, g.person, g.person.email, "deviceRecovery");
    return { ok: true as const };
  },
});

// שלב ב: הקוד מהמייל נכון. פותחים בקשה שתבשיל בעוד 24 שעות, והמכשיר החדש מקבל סוד שיצטרך בסוף.
export const recoveryConfirm = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), emailCode: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, pin, emailCode, device }) => {
    const g = await gate(ctx, { code, personId, pin, device });
    if (!g.ok) return asFail(g);
    if (!(await verifyCode(ctx, personId, "deviceRecovery", emailCode))) return { ok: false as const, reason: "secretCode" as const };
    for (const r of await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) await ctx.db.delete(r._id);
    const secret = randomHex(32);
    const now = Date.now();
    await ctx.db.insert("deviceRecoveries", {
      personId, secretHash: await hashSecret(secret), requestedAt: now, readyAt: now + RECOVERY_WAIT_MS, expiresAt: now + RECOVERY_TTL_MS,
    });
    await ctx.scheduler.runAfter(0, internal.email.notifyDeviceChange, { personId, kind: "requested" });
    return { ok: true as const, secret, readyAt: now + RECOVERY_WAIT_MS };
  },
});

// שלב ג: אחרי ההמתנה. קוד סודי + הסוד ששמור במכשיר החדש. ממשיכים ל-moveFinish.
export const recoveryFinish = mutation({
  args: { code: v.optional(v.string()), personId: v.id("people"), pin: v.string(), secret: v.string(), device: v.optional(v.string()) },
  handler: async (ctx, { code, personId, pin, secret, device }) => {
    const g = await gate(ctx, { code, personId, pin, device });
    if (!g.ok) return asFail(g);
    const rows = await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
    const hash = secret.length <= 100 ? await hashSecret(secret) : "";
    const row = rows.find((r) => r.secretHash === hash);
    const now = Date.now();
    if (!row || row.expiresAt < now) return { ok: false as const, reason: "none" as const };
    if (row.readyAt > now) return { ok: false as const, reason: "wait" as const, readyAt: row.readyAt };
    return await issueTicket(ctx, g.person);
  },
});

// בקשות החלפת מכשיר שממתינות (להורים). המכשיר הישן מציג אזהרה ואפשרות ביטול.
export const pendingMoves = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token);
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    const out: { personId: Id<"people">; name: string; mine: boolean; requestedAt: number; readyAt: number }[] = [];
    for (const p of people) {
      if (p.role !== "parent") continue;
      for (const r of await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", p._id)).collect()) {
        if (r.expiresAt >= Date.now()) out.push({ personId: p._id, name: p.name, mine: p._id === me._id, requestedAt: r.requestedAt, readyAt: r.readyAt });
      }
    }
    return out;
  },
});

// ביטול בקשה (ההורה עצמו מהמכשיר הקשור, או הורה אחר). ביטול רק מגן, לכן לא דורש טביעת אצבע.
export const cancelRecovery = mutation({
  args: { token: v.string(), personId: v.id("people") },
  handler: async (ctx, { token, personId }) => {
    const me = await requireParent(ctx, token);
    await requireSameFamily(ctx, me, personId);
    for (const r of await ctx.db.query("deviceRecoveries").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) await ctx.db.delete(r._id);
  },
});
