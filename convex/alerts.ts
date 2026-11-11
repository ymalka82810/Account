import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { notify } from "./notify";

// התראות אבטחה להורים. נשלחות כהתראת דחיפה למכשירים הרשומים (במקום המיילים שהיו פעם).

async function parentIds(ctx: MutationCtx, familyId: Id<"families"> | undefined): Promise<Id<"people">[]> {
  if (!familyId) return [];
  const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
  return members.filter((m) => m.role === "parent").map((m) => m._id);
}

// הקוד הסודי של מישהו ננעל אחרי כמה ניסיונות שגויים.
export async function alertLock(ctx: MutationCtx, p: Doc<"people">): Promise<void> {
  await notify(ctx, await parentIds(ctx, p.familyId), "🔒 " + p.name,
    `הקוד הסודי של ${p.name} ננעל אחרי כמה ניסיונות שגויים. אם זה לא הוא/היא, כדאי לקבוע קוד חדש.`, "manage");
}

// החלפת מכשיר של הורה: אל ההורה עצמו ואל שאר ההורים.
//   requested = הוגשה בקשה שתבשיל בעוד 24 שעות.   changed = המכשיר הוחלף.   added = נוסף מכשיר.
export async function alertDeviceChange(ctx: MutationCtx, personId: Id<"people">, kind: "requested" | "changed" | "added"): Promise<void> {
  const p = await ctx.db.get(personId);
  if (!p) return;
  const body = kind === "requested"
    ? `הוגשה בקשה להחליף את המכשיר של ${p.name}. היא תתאפשר בעוד 24 שעות, ואפשר לבטל אותה בלשונית "ניהול".`
    : kind === "added"
      ? `נוסף מכשיר שממנו ${p.name} נכנס/ת כהורה. אם זה לא ${p.name}, הסירו אותו ב"המכשירים שלי".`
      : `${p.name} נכנס/ת עכשיו ממכשיר חדש, והמכשיר הקודם נותק.`;
  await notify(ctx, [personId, ...(await parentIds(ctx, p.familyId))], "📱 " + p.name, body, "manage");
}
