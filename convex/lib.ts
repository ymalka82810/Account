import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_AMOUNT = 1_000_000; // באגורות = 10,000 ש"ח
export const MAX_FAMILY_SIZE = 50;

// הגבלות קצב. ניחושי קוד שגויים נספרים לפי מכשיר (לא לכל השרת), כך שמי שמנחש
// לא יכול לנעול את הכניסה לכל המשפחות. קוד משפחה הוא 2^50 אפשרויות, אז הגבלה
// נדיבה מספיקה. את הקוד הסודי של 4 ספרות מגינה הנעילה המדורגת לפי אדם (למטה).
export const CODE_FAIL_LIMIT = 30; // ניחושי קוד משפחה שגויים למכשיר
export const CODE_FAIL_WINDOW_MS = 10 * 60 * 1000;
export const CREATE_FAMILY_LIMIT = 120; // משפחות חדשות
export const CREATE_FAMILY_WINDOW_MS = 10 * 60 * 1000;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// גיבוב קוד סודי: PBKDF2-SHA256 עם 100K סבבים. הקידומת מציינת את הגרסה:
//   v2:  בלי pepper.   v2p:  עם pepper (משתנה הסביבה PIN_PEPPER, שלא נשמר במסד).
// בלי קידומת = הגיבוב הישן (SHA-256 בלולאה של 2000), שמשודרג בכניסה מוצלחת.
const PBKDF2_ITERATIONS = 100_000;
const pepper = () => process.env.PIN_PEPPER ?? "";

async function pbkdf2Hex(pin: string, salt: string, pep: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pep + ":" + pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256,
  );
  return toHex(bits);
}

async function legacyHashPin(pin: string, salt: string): Promise<string> {
  let h = await sha256(salt + ":" + pin);
  for (let i = 0; i < 2000; i++) h = await sha256(toHex(h) + salt);
  return toHex(h);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const pep = pepper();
  return (pep ? "v2p:" : "v2:") + (await pbkdf2Hex(pin, salt, pep));
}

export async function verifyPin(pin: string, salt: string, stored: string): Promise<boolean> {
  if (stored.startsWith("v2p:")) {
    const pep = pepper();
    // pepper שנעלם מהסביבה: אי אפשר לאמת, ולכן נכשלים (ולא מתחזים ל"אין pepper").
    return pep !== "" && safeEqual(stored.slice(4), await pbkdf2Hex(pin, salt, pep));
  }
  if (stored.startsWith("v2:")) return safeEqual(stored.slice(3), await pbkdf2Hex(pin, salt, ""));
  return safeEqual(stored, await legacyHashPin(pin, salt));
}

// גיבוב ישן, או כזה שאינו תואם למצב ה-pepper הנוכחי: כדאי לגבב מחדש אחרי אימות מוצלח.
export const pinNeedsUpgrade = (stored: string) => !stored.startsWith(pepper() ? "v2p:" : "v2:");

// אחרי אימות מוצלח של הקוד: משדרג את הגיבוב השמור לפורמט הנוכחי.
export async function upgradePinHash(ctx: MutationCtx, p: Doc<"people">, pin: string) {
  if (!p.pinHash || !p.pinSalt || !pinNeedsUpgrade(p.pinHash)) return;
  await ctx.db.patch(p._id, { pinHash: await hashPin(pin, p.pinSalt) });
}

export async function hashToken(token: string): Promise<string> {
  return toHex(await sha256("session:" + token));
}

// ילדים ונוער: בדיוק 4 ספרות (פשוט לזכור). הורים מאשרים כסף, אז מותר להם קוד ארוך יותר (עד 8).
export const PARENT_PIN_MAX = 8;
export const validPin = (pin: string, role?: string) =>
  role === "parent" ? new RegExp(`^\\d{4,${PARENT_PIN_MAX}}$`).test(pin) : /^\d{4}$/.test(pin);
export const pinRuleMessage = (role?: string) =>
  role === "parent" ? `הקוד צריך להיות 4 ספרות לפחות, ועד ${PARENT_PIN_MAX}` : "הקוד צריך להיות 4 ספרות";

// מזהה מכשיר אקראי שהאפליקציה יוצרת. לא מזהה אישי, רק מפתח להגבלת קצב.
export function deviceKey(device: string | undefined): string {
  const d = (device ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  return "code-fail:" + (d || "anon");
}

// ---------- נעילה מדורגת של קוד סודי ----------
export const MAX_FAILS = 5;
export const LOCK_STEPS_MS = [
  60 * 1000, // דקה
  5 * 60 * 1000, // 5 דקות
  60 * 60 * 1000, // שעה
  6 * 60 * 60 * 1000, // 6 שעות
  24 * 60 * 60 * 1000, // יממה (המקסימום)
];
export const ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type PinFailResult =
  | { locked: false; left: number }
  | { locked: true; waitSeconds: number };

// רושם ניסיון שגוי. אחרי MAX_FAILS כישלונות נועל, ובכל נעילה הזמן ארוך יותר.
export async function registerPinFail(ctx: MutationCtx, p: Doc<"people">): Promise<PinFailResult> {
  const fails = (p.failedAttempts ?? 0) + 1;
  if (fails < MAX_FAILS) {
    await ctx.db.patch(p._id, { failedAttempts: fails });
    return { locked: false, left: MAX_FAILS - fails };
  }
  const level = p.lockLevel ?? 0;
  const lockMs = LOCK_STEPS_MS[Math.min(level, LOCK_STEPS_MS.length - 1)];
  const now = Date.now();
  await ctx.db.patch(p._id, {
    failedAttempts: 0,
    lockedUntil: now + lockMs,
    lockLevel: level + 1,
    lockCount: (p.lockCount ?? 0) + 1,
    lastLockAt: now,
  });
  return { locked: true, waitSeconds: Math.ceil(lockMs / 1000) };
}

export function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 20) throw new ConvexError("שם לא תקין");
  return clean;
}

export function cleanFamilyName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 30) throw new ConvexError("שם המשפחה לא תקין");
  return clean;
}

// ---------- קודי משפחה ----------
// 32 תווים בלי תווים מבלבלים (0/O, 1/I). 10 תווים = 2^50 אפשרויות.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 10;

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b & 31]).join("");
}

// ---------- כרטיסי כניסה למכשיר ----------
export const PASS_PREFIX = "dev_";
export const isPass = (raw: string) => raw.startsWith(PASS_PREFIX);
// כרטיס פג אחרי PASS_TTL_MS בלי שימוש. כל כניסה למסך המשפחה מחדשת אותו.
// כרטיסים ישנים בלי expiresAt נחשבים לפי createdAt.
export const PASS_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const passExpiry = (p: Doc<"devicePasses">) => p.expiresAt ?? p.createdAt + PASS_TTL_MS;

export async function issuePass(ctx: MutationCtx, familyId: Id<"families">, label?: string): Promise<string> {
  const pass = PASS_PREFIX + randomHex(32);
  const now = Date.now();
  await ctx.db.insert("devicePasses", {
    familyId, passHash: await hashToken(pass), createdAt: now, expiresAt: now + PASS_TTL_MS,
    label: label?.trim().slice(0, 40) || undefined,
  });
  return pass;
}

export async function purgePasses(ctx: MutationCtx, familyId: Id<"families">) {
  for (const p of await ctx.db.query("devicePasses").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()) {
    await ctx.db.delete(p._id);
  }
}

// קוד הצטרפות אחד לכל משפחה. מי שמצטרף/ת איתו נכנס/ת תמיד בתור ילד/ה.
// קוד ההורים הישן (parentCode) כבר לא פותח כלום.
// מקבל גם כרטיס כניסה של מכשיר (dev_...) במקום הקוד; אז passId מסמן שזה כרטיס.
export async function findFamilyByCode(
  ctx: QueryCtx, rawCode: string,
): Promise<{ family: Doc<"families">; passId?: Id<"devicePasses"> } | null> {
  if (isPass(rawCode)) {
    if (rawCode.length > 100) return null;
    const passHash = await hashToken(rawCode);
    const pass = await ctx.db.query("devicePasses").withIndex("by_hash", (q) => q.eq("passHash", passHash)).first();
    if (!pass || passExpiry(pass) < Date.now()) return null;
    const family = await ctx.db.get(pass.familyId);
    return family ? { family, passId: pass._id } : null;
  }
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LEN) return null;
  const family = await ctx.db.query("families").withIndex("by_childCode", (q) => q.eq("childCode", code)).first();
  return family ? { family } : null;
}

// קוד חדש שלא קיים אצל אף משפחה (גם לא כקוד הורים ישן).
export async function freshCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const taken = (await findFamilyByCode(ctx, code))
      || (await ctx.db.query("families").withIndex("by_parentCode", (q) => q.eq("parentCode", code)).first());
    if (!taken) return code;
  }
  throw new ConvexError("משהו השתבש. נסו שוב.");
}

// תאריך הלידה של מי שמקים קופה משפחתית (YYYY-MM-DD): חייב להיות תקין ולהראות גיל 18 ומעלה.
// זו הצהרה עצמית, בלי אימות, אבל נשמרת בשרת ונבדקת שם ולא רק באפליקציה.
export function requireAdultBirthDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const bad = () => new ConvexError("תאריך לידה לא תקין");
  if (!m) throw bad();
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw bad();
  const now = new Date();
  const nm = now.getUTCMonth() + 1;
  let age = now.getUTCFullYear() - y;
  if (nm < mo || (nm === mo && now.getUTCDate() < d)) age--;
  if (age < 0) throw bad();
  if (age < 18) throw new ConvexError("קופה משפחתית נפתחת רק על ידי מי שמעל גיל 18");
  return raw;
}

export async function createFamilyDoc(ctx: MutationCtx, name: string): Promise<Id<"families">> {
  return await ctx.db.insert("families", { name, childCode: await freshCode(ctx), createdAt: Date.now() });
}

// הערה: שגיאות של קוד משפחה מוחזרות כתוצאה (ולא נזרקות) כדי שספירת הניסיונות תישמר.
// הספירה היא לפי מכשיר (device), לא גלובלית, כדי שמנחש אחד לא ינעל את כולם.
export const failCode = async (ctx: MutationCtx, device: string | undefined) => {
  await noteHit(ctx, deviceKey(device), CODE_FAIL_WINDOW_MS);
  return { ok: false as const, reason: "code" as const };
};
export const codeThrottled = (ctx: MutationCtx, device: string | undefined) =>
  isThrottled(ctx, deviceKey(device), CODE_FAIL_LIMIT, CODE_FAIL_WINDOW_MS);

// ---------- הגבלת קצב ----------
export async function isThrottled(ctx: QueryCtx, key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await ctx.db.query("throttles").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (!row) return false;
  if (Date.now() - row.windowStart > windowMs) return false;
  return row.count >= limit;
}

export async function noteHit(ctx: MutationCtx, key: string, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await ctx.db.query("throttles").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (!row) await ctx.db.insert("throttles", { key, windowStart: now, count: 1 });
  else if (now - row.windowStart > windowMs) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
  else await ctx.db.patch(row._id, { count: row.count + 1 });
}

// ---------- נתונים מהגרסה של משפחה אחת ----------
export async function legacyPeople(ctx: QueryCtx): Promise<Doc<"people">[]> {
  return await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", undefined)).collect();
}

// מעביר את כל מי שאין לו משפחה (ואת הרשומות שלהם) למשפחה חדשה אחת.
// נקרא רק מכניסה של הורה. מחזיר null אם אין מה להעביר.
export async function adoptLegacy(ctx: MutationCtx): Promise<Id<"families"> | null> {
  const people = await legacyPeople(ctx);
  if (!people.length) return null;
  const familyId = await createFamilyDoc(ctx, "המשפחה שלי");
  for (const p of people) await ctx.db.patch(p._id, { familyId });
  const entries = await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", undefined)).collect();
  for (const e of entries) await ctx.db.patch(e._id, { familyId });
  return familyId;
}

// ---------- כניסה והרשאות ----------
export async function getSessionPerson(ctx: QueryCtx, token: string): Promise<Doc<"people"> | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = await hashToken(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session || session.expiresAt < Date.now()) return null;
  return await ctx.db.get(session.personId);
}

// דמות ליד השם, עם ברירת מחדל אם לא נבחרה (למשל אצל הורים מלפני הפיצ'ר).
export function avatarOf(p: Doc<"people">): string | undefined {
  if (p.avatar) return p.avatar;
  if (p.role === "parent") return p.gender === "female" ? "👩" : "👨";
  return "🙂";
}

export type Member = Doc<"people"> & { familyId: Id<"families"> };

export async function requirePerson(ctx: QueryCtx, token: string): Promise<Member> {
  const me = await getSessionPerson(ctx, token);
  if (!me) throw new ConvexError("צריך להיכנס מחדש");
  if (!me.familyId) throw new ConvexError("צריך להיכנס מחדש");
  return me as Member;
}

export async function requireParent(ctx: QueryCtx, token: string): Promise<Member> {
  const me = await requirePerson(ctx, token);
  if (me.role !== "parent") throw new ConvexError("רק הורים יכולים לעשות את זה");
  return me;
}

// אדם שחייב להיות באותה משפחה כמו המחובר/ת. אחרת מתנהגים כאילו הוא לא קיים.
export async function requireSameFamily(ctx: QueryCtx, me: Member, personId: Id<"people">): Promise<Doc<"people">> {
  const p = await ctx.db.get(personId);
  if (!p || p.familyId !== me.familyId) throw new ConvexError("אדם לא קיים");
  return p;
}

// ---------- תאריכים (שעון ישראל) ----------
const parseDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
};
const fmtUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export function jerusalemToday(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function addDays(d: string, n: number): string {
  const { y, m, day } = parseDay(d);
  return fmtUTC(Date.UTC(y, m - 1, day) + n * 86400000);
}

export function weekdayOf(d: string): number {
  const { y, m, day } = parseDay(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

// התאריך הראשון אחרי היום שמתאים לתזמון (יום בשבוע או יום בחודש 1-28).
export function firstAfter(today: string, frequency: "weekly" | "monthly", weekday?: number, monthDay?: number): string {
  if (frequency === "weekly") {
    let d = addDays(today, 1);
    while (weekdayOf(d) !== weekday) d = addDays(d, 1);
    return d;
  }
  const { y, m } = parseDay(today);
  const thisMonth = fmtUTC(Date.UTC(y, m - 1, monthDay!));
  return thisMonth > today ? thisMonth : fmtUTC(Date.UTC(y, m, monthDay!));
}

export function advanceDate(d: string, frequency: "weekly" | "monthly", monthDay?: number): string {
  if (frequency === "weekly") return addDays(d, 7);
  const { y, m } = parseDay(d);
  return fmtUTC(Date.UTC(y, m, monthDay ?? parseDay(d).day));
}

// ---------- מייל וקודי אימות ----------
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_SEND_LIMIT = 5; // בקשות קוד לאדם
export const EMAIL_SEND_WINDOW_MS = 10 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// קוד של 6 ספרות בלי הטיה (דגימה עם דחייה).
export function generateEmailCode(): string {
  const a = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(a); while (a[0] >= limit);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return (name[0] ?? "") + "***@" + (domain ?? "");
}

// ---------- קישור הורה למכשיר ----------
export const TICKET_TTL_MS = 10 * 60 * 1000; // מהרגע שהקודים אומתו ועד שהמכשיר החדש נרשם
export const BIND_CODE_TTL_MS = 30 * 60 * 1000; // קוד קישור שהורה מוסר להורה אחר
export const RECOVERY_WAIT_MS = 24 * 60 * 60 * 1000; // המתנה לפני החלפת מכשיר שאבד
export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // כמה זמן הבקשה תקפה אחרי שהוגשה
export const LOGIN_CHALLENGES_PER_DEVICE = 3;
export const LOGIN_CHALLENGES_PER_PERSON = 200;

// ---------- מכשירים מהימנים וניחושים ממכשירים זרים ----------
// הנעילה המדורגת של אדם נספרת רק מכשלונות ממכשיר מהימן שלו (מכשיר שנכנס ממנו בהצלחה
// או שהקים/הצטרף ממנו). ניחושים ממכשיר אחר לא נועלים את האדם: הם מוגבלים לפי
// (אדם, מכשיר) ובסך הכול לאדם, ולכן מי שמחזיק קוד משפחה לא יכול לנעול ילד מול המכשיר שלו.
export const MAX_TRUSTED_DEVICES = 5;
export const GUESS_DEVICE_LIMIT = 5;
export const GUESS_DEVICE_WINDOW_MS = 10 * 60 * 1000;
export const GUESS_PERSON_LIMIT = 20;
export const GUESS_PERSON_WINDOW_MS = 60 * 60 * 1000;

export const cleanDeviceId = (device: string | undefined) => (device ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);

export async function trustKeyOf(personId: Id<"people">, device: string | undefined): Promise<string | null> {
  const d = cleanDeviceId(device);
  return d ? toHex(await sha256("trust:" + personId + ":" + d)) : null;
}

export async function hitCount(ctx: QueryCtx, key: string, windowMs: number): Promise<number> {
  const row = await ctx.db.query("throttles").withIndex("by_key", (q) => q.eq("key", key)).first();
  return row && Date.now() - row.windowStart <= windowMs ? row.count : 0;
}

export const guessKeys = (personId: Id<"people">, device: string | undefined) => ({
  person: "guess:" + personId,
  device: "guess:" + personId + ":" + (cleanDeviceId(device) || "anon"),
});
