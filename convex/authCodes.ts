import { MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { CODE_MAX_ATTEMPTS, generateCode, hashPin, randomHex, verifyPin } from "./lib";

// קודים חד-פעמיים לאישור פעולות רגישות (נשמרים כגיבוב בלבד, בטבלה emailCodes - השם נשאר מהתקופה שבה נשלחו במייל).
// אף קוד לא נשלח בשום ערוץ: הוא מוחזר למי שביקש ומשמש מיד, או נמסר ביד.
//   - אחרי אימות עם חשבון הגוגל המחובר (googleAuth.ts): pinChange, pinReset, childReset, emailChange, deviceFirst, deviceRecovery.
//   - מוצג על מכשיר קשור / נמסר ביד: deviceMove, deviceBind, deviceAdd.
// "verify" ישן (אימות מייל בקוד): כבר לא נוצר, ונשאר בסכמה רק עד שהשורות הישנות פגות ונמחקות.
export type CodePurpose = "pinChange" | "pinReset" | "childReset" | "emailChange" | "deviceMove" | "deviceBind" | "deviceAdd" | "deviceRecovery" | "deviceFirst";

// בודק קוד. מחזיר null (ולא זורק) כדי שספירת הניסיונות תישמר. קוד נכון נמחק (חד-פעמי).
export async function verifyCode(ctx: MutationCtx, personId: Doc<"people">["_id"], purpose: CodePurpose, rawCode: string): Promise<Doc<"emailCodes"> | null> {
  const code = rawCode.replace(/\D/g, "").slice(0, 6);
  const rows = await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
  const row = rows.find((r) => r.purpose === purpose);
  if (!row) return null;
  if (row.expiresAt < Date.now() || row.attempts >= CODE_MAX_ATTEMPTS) return null;
  if (code.length !== 6 || !(await verifyPin(code, row.salt, row.codeHash))) {
    await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
    return null;
  }
  await ctx.db.delete(row._id);
  return row;
}

// יוצר קוד חדש (מבטל קודם באותה מטרה) ומחזיר אותו למי שביקש.
export async function issueLocalCode(ctx: MutationCtx, person: Doc<"people">, purpose: CodePurpose, ttlMs: number): Promise<string> {
  for (const old of await ctx.db.query("emailCodes").withIndex("by_person", (q) => q.eq("personId", person._id)).collect()) {
    if (old.purpose === purpose) await ctx.db.delete(old._id);
  }
  const code = generateCode();
  const salt = randomHex(16);
  await ctx.db.insert("emailCodes", {
    personId: person._id,
    email: "",
    purpose,
    codeHash: await hashPin(code, salt),
    salt,
    expiresAt: Date.now() + ttlMs,
    attempts: 0,
  });
  return code;
}
