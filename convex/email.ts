import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// שליחה דרך Resend. משתני סביבה ב-Convex (Settings > Environment Variables):
//   RESEND_API_KEY  מפתח ה-API.
//   EMAIL_FROM      כתובת שולח, למשל "הקופה <no-reply@yourdomain.com>". בלי דומיין מאומת
//                   ברירת המחדל onboarding@resend.dev שולחת רק לכתובת של בעל חשבון Resend.
//   EMAIL_MODE=dev  מצב פיתוח: המייל מודפס ללוג של Convex במקום להישלח. לא להפעיל בפרודקשן.
async function deliver(to: string, subject: string, text: string): Promise<void> {
  if (process.env.EMAIL_MODE === "dev") {
    console.log(`[EMAIL dev] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY לא מוגדר. המייל לא נשלח.");
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Account <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) console.error("שליחת מייל נכשלה", res.status, await res.text());
}

const SUBJECTS: Record<string, string> = {
  verify: "קוד אימות למייל בקופה",
  pinChange: "קוד לשינוי הקוד הסודי בקופה",
  pinReset: "קוד לאיפוס הקוד הסודי בקופה",
  childReset: "קוד לאישור קוד סודי חדש לילד/ה בקופה",
  emailChange: "קוד לאישור החלפת המייל בקופה",
};

export const sendCode = internalAction({
  args: { to: v.string(), code: v.string(), purpose: v.string() },
  handler: async (_ctx, { to, code, purpose }) => {
    const text =
      `הקוד שלך: ${code}\n\n` +
      `הקוד תקף ל-10 דקות ומשמש פעם אחת.\n` +
      `אם לא ביקשת אותו, אפשר להתעלם מההודעה. אף אחד לא יכול להיכנס רק עם הקוד הזה.`;
    await deliver(to, SUBJECTS[purpose] ?? "קוד אימות בקופה", text);
  },
});

export const lockRecipients = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const p = await ctx.db.get(personId);
    if (!p || !p.familyId) return { name: "", emails: [] as string[] };
    const familyId = p.familyId;
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    const emails = members
      .filter((m) => m.role === "parent" && m.emailVerified && m.email)
      .map((m) => m.email as string);
    return { name: p.name, emails };
  },
});

// התראה להורים (עם מייל מאומת) כשהקוד הסודי של מישהו ננעל אחרי ניסיונות שגויים.
export const notifyLock = internalAction({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const { name, emails } = await ctx.runQuery(internal.email.lockRecipients, { personId });
    for (const to of emails) {
      await deliver(
        to,
        "הקוד הסודי של " + name + " ננעל בקופה",
        `הקוד הסודי של ${name} ננעל אחרי כמה ניסיונות שגויים.\n` +
          `אם זה לא הוא/היא, כדאי להיכנס לקופה ולקבוע קוד חדש.`,
      );
    }
  },
});
