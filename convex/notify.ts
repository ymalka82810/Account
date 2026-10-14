import { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const shekel = (agorot: number) => {
  const s = (agorot / 100).toFixed(2);
  return "₪" + (s.endsWith(".00") ? s.slice(0, -3) : s);
};

// שולח התראה רק למי שיש לו מכשיר רשום, ורק אם מפתחות ההתראות הוגדרו בשרת.
export async function notify(ctx: MutationCtx, personIds: Id<"people">[], title: string, body: string): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return;
  const withDevice: Id<"people">[] = [];
  for (const id of Array.from(new Set(personIds))) {
    const sub = await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", id)).first();
    if (sub) withDevice.push(id);
  }
  if (!withDevice.length) return;
  await ctx.scheduler.runAfter(0, internal.pushSend.send, { personIds: withDevice, title, body });
}

export type EntryLike = { kind: "debt" | "payment"; from: Id<"people">; to: Id<"people">; amount: number };
export type Names = { from: string; to: string; creator: string };

// משפט כללי על רשומה (להורים שמאשרים, ולמי שיצר).
export function entryLine(e: EntryLike, n: Names): string {
  return `${n.from} ${e.kind === "debt" ? "חייב/ת" : "החזיר/ה"} ל${n.to} ${shekel(e.amount)}`;
}

// משפט מנקודת המבט של מי שמקבל את ההתראה (מי שלא יצר את הרשומה).
export function entryTextFor(recipient: Id<"people">, e: EntryLike, n: Names): string {
  const amt = shekel(e.amount);
  if (e.kind === "debt") {
    if (recipient === e.to) return `${n.creator} רשם/ה ש${n.from} חייב/ת לך ${amt}`;
    return `${n.creator} רשם/ה שאת/ה חייב/ת ל${n.to} ${amt}`;
  }
  if (recipient === e.to) return `${n.creator} רשם/ה ש${n.from} החזיר/ה לך ${amt}`;
  return `${n.creator} רשם/ה שהחזרת ל${n.to} ${amt}`;
}
