import { ConvexError } from "convex/values";
import { QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_AMOUNT = 1_000_000; // באגורות = 10,000 ש"ח

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

export async function requirePerson(ctx: QueryCtx, token: string): Promise<Doc<"people">> {
  const me = await getSessionPerson(ctx, token);
  if (!me) throw new ConvexError("צריך להיכנס מחדש");
  return me;
}

export async function requireParent(ctx: QueryCtx, token: string): Promise<Doc<"people">> {
  const me = await requirePerson(ctx, token);
  if (me.role !== "parent") throw new ConvexError("רק הורים יכולים לעשות את זה");
  return me;
}
