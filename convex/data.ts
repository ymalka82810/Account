import { query } from "./_generated/server";
import { v } from "convex/values";
import { ALERT_WINDOW_MS, avatarOf, getSessionPerson, maskEmail } from "./lib";

// כל נתוני המשפחה למי שמחובר/ת. בלי כניסה תקינה מחזיר null.
// אם החשבון הוא מהגרסה הישנה (בלי משפחה), מחזיר legacy כדי שהאפליקציה תעביר אותו.
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getSessionPerson(ctx, token);
    if (!me) return null;
    if (!me.familyId) return { legacy: true as const, canMigrate: me.role === "parent" };
    const familyId = me.familyId;
    const family = await ctx.db.get(familyId);
    if (!family) return null;
    const people = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    let entries = await ctx.db.query("entries").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect();
    // ילדים רואים רק רשומות שקשורות אליהם. הורים רואים הכול.
    // רשומות שממתינות לאישור מוצגות רק למי שיצר/ה אותן ולהורים.
    if (me.role !== "parent") {
      entries = entries.filter((e) => (e.from === me._id || e.to === me._id) && (e.status !== "pending" || e.createdBy === me._id));
    }
    const recurring = me.role === "parent"
      ? await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect()
      : [];
    return {
      legacy: false as const,
      me: {
        id: me._id, name: me.name, role: me.role, avatar: avatarOf(me), gender: me.gender ?? null,
        palette: me.palette ?? "blue",
        // מייל מוסתר חלקית (למסך ההגדרות). מאומת = אפשר לשלוח אליו קודים.
        email: me.emailVerified && me.email ? maskEmail(me.email) : null,
        pendingEmail: me.pendingEmail ? maskEmail(me.pendingEmail) : null,
      },
      // קוד ההצטרפות לא נשלח כאן: הורה חושף אותו בטביעת אצבע / זיהוי פנים (family:revealCode).
      family: {
        name: family.name,
        currency: family.currency ?? "ILS",
        country: family.country ?? (family.currency ? null : "IL"),
        // האם הוגדרו למשפחה מיקום או מטבע (אחרת הערכים למעלה הם ברירת המחדל של הנתונים הישנים)
        localeSet: !!(family.country || family.currency),
      },
      people: people.map((p) => ({
        id: p._id, name: p.name, role: p.role, avatar: avatarOf(p), gender: p.gender ?? null, hasPin: !!p.pinHash,
        // התראה להורים בלבד: הקוד של האדם ננעל בגלל ניסיונות כושלים בשבוע האחרון.
        lockAlert: me.role === "parent" && !!p.lastLockAt && Date.now() - p.lastLockAt < ALERT_WINDOW_MS
          ? { count: p.lockCount ?? 1, at: p.lastLockAt }
          : null,
        // מצב חברים (בני נוער). המייל והבקשות מוצגים להורים בלבד.
        friendsEnabled: !!p.friendsEnabled,
        friendsRequested: me.role === "parent" ? !!p.friendsRequested : false,
        friendEmail: me.role === "parent" ? p.friendEmail ?? null : null,
      })),
      // בקשות הצטרפות שממתינות לאישור. להורים בלבד.
      joinRequests: me.role === "parent"
        ? (await ctx.db.query("joinRequests").withIndex("by_family", (q) => q.eq("familyId", familyId)).collect())
            .map((r) => ({ id: r._id, name: r.name, avatar: r.avatar ?? null, createdAt: r.createdAt }))
        : [],
      entries: entries.map((e) => ({
        id: e._id, kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note,
        currency: e.currency ?? "ILS", fx: e.fx ?? null,
        date: e.date, createdBy: e.createdBy ?? null, createdAt: e.createdAt ?? e._creationTime,
        status: e.status ?? "approved",
        debtId: e.debtId ?? null,
      })),
      recurring: recurring.map((r) => ({
        id: r._id, from: r.from, to: r.to, amount: r.amount, currency: r.currency ?? "ILS", note: r.note, frequency: r.frequency,
        weekday: r.weekday ?? null, monthDay: r.monthDay ?? null, nextDate: r.nextDate,
      })),
    };
  },
});
