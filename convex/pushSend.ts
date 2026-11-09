"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import webpush from "web-push";
import { createSign } from "node:crypto";
import ICONS from "../assets/currency-icons.json";

// שולח התראה לכל המכשירים של האנשים האלה: דפדפנים (Web Push) ואפליקציית האנדרואיד (FCM).
// Web Push: צריך להגדיר בשרת (Convex Environment Variables) VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// אנדרואיד: צריך FCM_SERVICE_ACCOUNT = תוכן קובץ ה-JSON של חשבון השירות מ-Firebase (Project settings → Service accounts).
// בלי המשתנים האלה, הערוץ המתאים פשוט לא נשלח.
export const FCM_PREFIX = "fcm:";
// ערוץ ההתראות באנדרואיד: נוצר באפליקציה בחשיבות גבוהה (קופץ למעלה עם צליל), וגם מוגדר כברירת המחדל במניפסט.
export const ANDROID_CHANNEL = "kupa";
const TABS = ["home", "friends", "history", "family", "manage"];
// אייקון שורת הסטטוס כמו אייקון האפליקציה: מטבע עם הסמל של מטבע המשפחה (ic_stat_<מטבע>, נוצרים ב-apply-currency-icons.py).
// חסר = דולר, כמו בשאר האפליקציה.
const byCurrency = ICONS.byCurrency as Record<string, string>;
const statIcon = (currency: string | undefined) => `ic_stat_${(byCurrency[currency || "USD"] || "USD").toLowerCase()}`;

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<ServiceAccount>;
    if (j.project_id && j.client_email && j.private_key) return { project_id: j.project_id, client_email: j.client_email, private_key: j.private_key };
  } catch { /* משתנה לא תקין: מתייחסים כאילו לא הוגדר */ }
  return null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// אסימון גישה של גוגל (OAuth2) מחשבון השירות: JWT חתום RS256 שמוחלף באסימון.
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`fcm auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// תוצאת שליחה: כמה מכשירים מכל סוג, לכמה הגיע, ושגיאות קצרות (בלי אסימונים ובלי מפתחות) לאבחון.
export type PushReport = {
  web: { devices: number; sent: number; configured: boolean };
  android: { devices: number; sent: number; configured: boolean };
  errors: string[];
};

async function deliver(subs: Doc<"pushSubs">[], title: string, body: string, tab: string | undefined, currencyOf: Record<string, string | undefined>) {
  const dead: Id<"pushSubs">[] = [];
  const errors: string[] = [];
  const web = subs.filter((s) => !s.endpoint.startsWith(FCM_PREFIX));
  const native = subs.filter((s) => s.endpoint.startsWith(FCM_PREFIX));
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sa = readServiceAccount();
  const report: PushReport = {
    web: { devices: web.length, sent: 0, configured: !!(pub && priv) },
    android: { devices: native.length, sent: 0, configured: !!sa },
    errors,
  };

  if (pub && priv && web.length) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    const payload = JSON.stringify({ title, body, ...(tab ? { tab } : {}) });
    await Promise.all(web.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        report.web.sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s._id);
        else errors.push(`web ${code ?? "network"}`);
      }
    }));
  }

  if (sa && native.length) {
    try {
      const access = await fcmAccessToken(sa);
      await Promise.all(native.map(async (s) => {
        try {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: {
              token: s.endpoint.slice(FCM_PREFIX.length),
              notification: { title, body },
              ...(tab ? { data: { tab } } : {}),
              android: {
                priority: "HIGH",
                ttl: "86400s",
                notification: { channel_id: ANDROID_CHANNEL, sound: "default", icon: statIcon(currencyOf[s.familyId]), color: "#E0A526" },
              },
            } }),
          });
          if (res.ok) { report.android.sent++; return; }
          const text = (await res.text()).slice(0, 300);
          // 404 / UNREGISTERED = האסימון כבר לא קיים (האפליקציה הוסרה). שאר השגיאות זמניות או של ההגדרה, ולא מוחקים בגללן.
          if (res.status === 404 || text.includes("UNREGISTERED")) dead.push(s._id);
          else errors.push(`fcm ${res.status}`);
          console.error(`FCM send failed ${res.status}: ${text}`);
        } catch (e) {
          errors.push("fcm network");
          console.error("FCM send network error", String(e));
        }
      }));
    } catch (e) {
      // אימות מול גוגל נכשל: בדרך כלל FCM_SERVICE_ACCOUNT שגוי או של פרויקט אחר
      errors.push("fcm auth");
      console.error("FCM auth failed", String(e));
    }
  }
  return { report, dead };
}

export const send = internalAction({
  args: { personIds: v.array(v.id("people")), title: v.string(), body: v.string(), tab: v.optional(v.string()) },
  handler: async (ctx, { personIds, title, body, tab }): Promise<void> => {
    const subs = await ctx.runQuery(internal.push.forPeople, { personIds });
    const currencyOf = await ctx.runQuery(internal.push.familyCurrencies, { familyIds: [...new Set(subs.map((s) => s.familyId))] });
    const { dead } = await deliver(subs, title, body, tab && TABS.includes(tab) ? tab : undefined, currencyOf);
    if (dead.length) await ctx.runMutation(internal.push.removeDead, { ids: dead });
  },
});

// התראת ניסיון למכשירים של מי שמחובר, עם דוח מה הצליח, כדי לבדוק את כל השרשרת מקצה לקצה.
export const test = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<PushReport> => {
    const me: Id<"people"> = await ctx.runQuery(internal.push.personForToken, { token });
    const subs = await ctx.runQuery(internal.push.forPeople, { personIds: [me] });
    const currencyOf = await ctx.runQuery(internal.push.familyCurrencies, { familyIds: [...new Set(subs.map((s) => s.familyId))] });
    const { report, dead } = await deliver(subs, "התראת ניסיון 🔔", "אם רואים את זה, ההתראות עובדות.", "home", currencyOf);
    if (dead.length) await ctx.runMutation(internal.push.removeDead, { ids: dead });
    return report;
  },
});

// אבחון (מורץ מ-GitHub Actions: push-diagnose.yml). מדפיס רק מידע שאינו סודי:
// לאיזה פרויקט Firebase שייך חשבון השירות, אם האימות מול גוגל עובד, כמה מכשירים רשומים,
// ולכל מכשיר אנדרואיד - בדיקת שליחה "יבשה" (validate_only, לא מגיעה לטלפון) והתשובה של FCM.
export const diagnose = internalAction({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const out: string[] = [];
    const sa = readServiceAccount();
    out.push(`FCM_SERVICE_ACCOUNT: ${sa ? `project_id=${sa.project_id}` : "missing or invalid JSON"}`);
    const subs = await ctx.runQuery(internal.push.allSubsForDiagnose, {});
    const native = subs.filter((s) => s.endpoint.startsWith(FCM_PREFIX));
    out.push(`devices: web=${subs.length - native.length} android=${native.length}`);
    for (const s of subs) out.push(`  ${s.endpoint.startsWith(FCM_PREFIX) ? "android" : "web"} registered ${new Date(s.createdAt).toISOString()}`);
    if (!sa) return out;
    let access = "";
    try { access = await fcmAccessToken(sa); out.push("google auth: ok"); }
    catch (e) { out.push(`google auth: FAILED ${String(e).slice(0, 200)}`); return out; }
    for (const s of native) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({ validate_only: true, message: { token: s.endpoint.slice(FCM_PREFIX.length), notification: { title: "x", body: "x" } } }),
      });
      const text = await res.text();
      const status = /"status":\s*"([A-Z_]+)"/.exec(text)?.[1] ?? "";
      const code = /"errorCode":\s*"([A-Z_]+)"/.exec(text)?.[1] ?? "";
      const msg = /"message":\s*"([^"]{0,160})/.exec(text)?.[1] ?? "";
      out.push(`  fcm dry-run: HTTP ${res.status} ${status} ${code} ${res.ok ? "" : msg}`);
    }
    return out;
  },
});
