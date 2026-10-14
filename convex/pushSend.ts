"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import webpush from "web-push";

// שולח התראה לכל המכשירים של האנשים האלה.
// צריך להגדיר בשרת (Convex Environment Variables): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
export const send = internalAction({
  args: { personIds: v.array(v.id("people")), title: v.string(), body: v.string() },
  handler: async (ctx, { personIds, title, body }): Promise<void> => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    const subs = await ctx.runQuery(internal.push.forPeople, { personIds });
    const payload = JSON.stringify({ title, body });
    const dead: Id<"pushSubs">[] = [];
    await Promise.all(subs.map(async (s) => {
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
    if (dead.length) await ctx.runMutation(internal.push.removeDead, { ids: dead });
  },
});
