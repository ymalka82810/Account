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

export async function hashPin(pin: string, salt: string): Promise<string> {
  let h = await sha256(salt + ":" + pin);
  for (let i = 0; i < 2000; i++) h = await sha256(toHex(h) + salt);
  return toHex(h);
}

export async function hashToken(token: string): Promise<string> {
  return toHex(await sha256("session:" + token));
}

export const validPin = (pin: string) => /^\d{4}$/.test(pin);

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

export async function findFamilyByCode(
  ctx: QueryCtx,
  rawCode: string,
): Promise<{ family: Doc<"families">; role: "parent" | "child" } | null> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LEN) return null;
  const asParent = await ctx.db.query("families").withIndex("by_parentCode", (q) => q.eq("parentCode", code)).first();
  if (asParent) return { family: asParent, role: "parent" };
  const asChild = await ctx.db.query("families").withIndex("by_childCode", (q) => q.eq("childCode", code)).first();
  if (asChild) return { family: asChild, role: "child" };
  return null;
}

// קוד חדש שלא קיים אצל אף משפחה (לא כקוד הורים ולא כקוד ילדים).
export async function freshCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    if (!(await findFamilyByCode(ctx, code))) return code;
  }
  throw new ConvexError("משהו השתבש. נסו שוב.");
}

export async function createFamilyDoc(ctx: MutationCtx, name: string): Promise<Id<"families">> {
  const parentCode = await freshCode(ctx);
  let childCode = await freshCode(ctx);
  while (childCode === parentCode) childCode = await freshCode(ctx);
  return await ctx.db.insert("families", { name, parentCode, childCode, createdAt: Date.now() });
}

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

// הורים אין להם אימוג'י ליד השם. ילדים ונערים כן, עם ברירת מחדל אם לא נבחר.
export function avatarOf(p: Doc<"people">): string | undefined {
  return p.role === "parent" ? undefined : (p.avatar ?? "🙂");
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
