import { ConvexError } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_TTL_MS, EMAIL_SEND_LIMIT, EMAIL_SEND_WINDOW_MS,
  generateEmailCode, hashPin, isThrottled, noteHit, randomHex,
} from "./lib";

export type CodePurpose = "verify" | "pinChange" | "pinReset" | "childReset" | "emailChange";

// יוצר קוד חדש (מבטל קודם באותה מטרה), שומר גיבוב ומתזמן שליחה למייל.
export async function issueCode(ctx: MutationCtx, person: Doc<"people">, email: string, purpose: CodePurpose): Promise<void> {
  const key = "mail:" + person._id;
  if (await isThrottled(ctx, key, EMAIL_SEND_LIMIT, EMAIL_SEND_WINDOW_MS)) {
    throw new ConvexError("יותר מדי בקשות לקוד. נסו שוב בעוד כמה דקות");
  }
  await noteHit(ctx, key, EMAIL_SEND_WINDOW_MS);
  for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", person._id)).collect()) {
    if (old.purpose === purpose) await ctx.db.delete(old._id);
  }
  const code = generateEmailCode();
  const salt = randomHex(16);
  await ctx.db.insert("emailCodes", {
    personId: person._id,
    email,
    purpose,
    codeHash: await hashPin(code, salt),
    salt,
    expiresAt: Date.now() + EMAIL_CODE_TTL_MS,
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.email.sendCode, { to: email, code, purpose });
}

// בודק קוד. מחזיר false (ולא זורק) כדי שספירת הניסיונות תישמר. קוד נכון נמחק (חד-פעמי).
export async function verifyCode(ctx: MutationCtx, personId: Doc<"people">["_id"], purpose: CodePurpose, rawCode: string): Promise<Doc<"emailCodes"> | null> {
  const code = rawCode.replace(/\D/g, "").slice(0, 6);
  const rows = await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
  const row = rows.find((r) => r.purpose === purpose);
  if (!row) return null;
  if (row.expiresAt < Date.now() || row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return null;
  if (code.length !== 6 || (await hashPin(code, row.salt)) !== row.codeHash) {
    await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
    return null;
  }
  await ctx.db.delete(row._id);
  return row;
}
