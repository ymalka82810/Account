"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import webpush from "web-push";
import { createSign } from "node:crypto";

// שולח התראה לכל המכשירים של האנשים האלה: דפדפנים (Web Push) ואפליקציית האנדרואיד (FCM).
// Web Push: צריך להגדיר בשרת (Convex Environment Variables) VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// אנדרואיד: צריך FCM_SERVICE_ACCOUNT = תוכן קובץ ה-JSON של חשבון השירות מ-Firebase (Project settings → Service accounts).
// בלי המשתנים האלה, הערוץ המתאים פשוט לא נשלח.
export const FCM_PREFIX = "fcm:";

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
  if (!res.ok) throw new Error(`fcm auth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export const send = internalAction({
  args: { personIds: v.array(v.id("people")), title: v.string(), body: v.string() },
  handler: async (ctx, { personIds, title, body }): Promise<void> => {
    const subs = await ctx.runQuery(internal.push.forPeople, { personIds });
    const dead: Id<"pushSubs">[] = [];

    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const web = subs.filter((s) => !s.endpoint.startsWith(FCM_PREFIX));
    if (pub && priv && web.length) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
      const payload = JSON.stringify({ title, body });
      await Promise.all(web.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24 },
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s._id);
        }
      }));
    }

    const sa = readServiceAccount();
    const native = subs.filter((s) => s.endpoint.startsWith(FCM_PREFIX));
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
                android: { priority: "HIGH", ttl: "86400s" },
              } }),
            });
            // 404 = האסימון כבר לא קיים (האפליקציה הוסרה). שאר השגיאות זמניות או של ההגדרה, ולא מוחקים בגללן.
            if (res.status === 404) dead.push(s._id);
          } catch { /* שגיאת רשת: ההתראה הזאת אובדת, לא מוחקים את המכשיר */ }
        }));
      } catch { /* אימות מול גוגל נכשל (חשבון שירות שגוי): לא שולחים */ }
    }

    if (dead.length) await ctx.runMutation(internal.push.removeDead, { ids: dead });
  },
});
