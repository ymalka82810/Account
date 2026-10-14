import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_AMOUNT = 1_000_000; // באגורות = 10,000 ש"ח
export const MAX_FAMILY_SIZE = 50;

// הגבלות קצב (גסות, לכל השרת). אפשר לכוון לפי השימוש.
export const CODE_FAIL_LIMIT = 300; // ניחושי קוד שגויים
export const CODE_FAIL_WINDOW_MS = 60 * 1000;
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
