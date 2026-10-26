import { mutation, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { concat, derToRaw } from "./der";
import { Member, hashPin, randomHex, registerPinFail, requireParent } from "./lib";

// אימות ביומטרי (טביעת אצבע / זיהוי פנים) לפעולות רגישות של הורים, כמו שינוי תפקיד.
//
// באתר: WebAuthn עם מאמת פלטפורמה (userVerification: required). השרת בודק את החתימה,
// שהאתגר תואם, שהמקור הוא האתר שלנו ושדגל UV (המשתמש אומת) דולק.
// באפליקציה (APK): מפתח EC בתוך ה-Android Keystore שאי אפשר להשתמש בו בלי טביעת אצבע
// או פנים (BiometricPrompt). האפליקציה חותמת על האתגר והשרת בודק את החתימה.
//
// רישום מכשיר חדש דורש את הקוד הסודי של ההורה, כדי שמי שתפס מכשיר פתוח לא יוכל
// לרשום את האצבע שלו.

const CHALLENGE_MS = 3 * 60 * 1000;

// מקורות מותרים ל-WebAuthn: האתר ב-GitHub Pages ופיתוח מקומי.
const ALLOWED_ORIGINS = ["https://ymalka82810.github.io"];
const originAllowed = (o: string) => ALLOWED_ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o);

// ---------- עזרי קידוד ----------
function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// WebCrypto מקבל BufferSource. ההמרה כאן רק בשביל TypeScript (Uint8Array<ArrayBufferLike>).
const bs = (b: Uint8Array) => b as unknown as BufferSource;
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", bs(b)));

// alg לפי COSE: -7 = ES256 (P-256), -257 = RS256.
async function verifySig(publicKeyB64: string, alg: number, sigDer: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    const spki = b64ToBytes(publicKeyB64);
    if (alg === -7) {
      const key = await crypto.subtle.importKey("spki", bs(spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bs(derToRaw(sigDer)), bs(data));
    }
    if (alg === -257) {
      const key = await crypto.subtle.importKey("spki", bs(spki), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bs(sigDer), bs(data));
    }
    return false;
  } catch {
    return false;
  }
}

// ההודעה שהאפליקציה חותמת עליה (Android Keystore).
const nativeMessage = (challenge: string) => new TextEncoder().encode("account-bio:" + challenge);

type ClientData = { type?: string; challenge?: string; origin?: string };
function parseClientData(b64: string): ClientData {
  try {
    return JSON.parse(new TextDecoder().decode(b64ToBytes(b64)));
  } catch {
    throw new ConvexError("האימות נכשל. נסו שוב.");
  }
}

// ---------- אתגרים ----------
async function newChallenge(ctx: MutationCtx, personId: Id<"people">, action: string): Promise<string> {
  // אתגר פתוח אחד לכל אדם. ישנים נמחקים.
  for (const c of await ctx.db.query("bioChallenges").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
    await ctx.db.delete(c._id);
  }
  const challenge = randomHex(32);
  await ctx.db.insert("bioChallenges", { personId, action, challenge, expiresAt: Date.now() + CHALLENGE_MS });
  return challenge;
}

async function takeChallenge(ctx: MutationCtx, personId: Id<"people">, action: string, challenge: string) {
  const rows = await ctx.db.query("bioChallenges").withIndex("by_person", (q) => q.eq("personId", personId)).collect();
  const row = rows.find((c) => c.challenge === challenge);
  if (!row || row.action !== action || row.expiresAt < Date.now()) {
    throw new ConvexError("פג תוקף האימות. נסו שוב.");
  }
  await ctx.db.delete(row._id);
}

export async function purgeBiometric(ctx: MutationCtx, personId: Id<"people">) {
  for (const k of await ctx.db.query("bioKeys").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
    await ctx.db.delete(k._id);
  }
  for (const c of await ctx.db.query("bioChallenges").withIndex("by_person", (q) => q.eq("personId", personId)).collect()) {
    await ctx.db.delete(c._id);
  }
}

// ---------- רישום מכשיר ----------
// שלב 1: ההורה מאשר עם הקוד הסודי שלו ומקבל אתגר לרישום.
export const registerStart = mutation({
  args: { token: v.string(), myPin: v.string() },
  handler: async (ctx, { token, myPin }) => {
    const me = await requireParent(ctx, token);
    if (!me.pinHash || !me.pinSalt) return { ok: false as const, reason: "nopin" as const };
    const now = Date.now();
    if (me.lockedUntil && me.lockedUntil > now) return { ok: false as const, reason: "locked" as const };
    if ((await hashPin(myPin, me.pinSalt)) !== me.pinHash) {
      const r = await registerPinFail(ctx, me);
      if (r.locked) await ctx.scheduler.runAfter(0, internal.email.notifyLock, { personId: me._id });
      return { ok: false as const, reason: "wrong" as const };
    }
    await ctx.db.patch(me._id, { failedAttempts: 0 });
    return { ok: true as const, challenge: await newChallenge(ctx, me._id, "register"), userId: me._id, name: me.name };
  },
});

// שלב 2: המכשיר יצר מפתח. באתר שולחים את clientDataJSON של הרישום,
// ובאפליקציה חתימה על האתגר (שמוכיחה שהמפתח עובד עם טביעת אצבע).
export const registerFinish = mutation({
  args: {
    token: v.string(),
    challenge: v.string(),
    kind: v.union(v.literal("webauthn"), v.literal("android")),
    credentialId: v.string(),
    publicKey: v.string(),
    alg: v.number(),
    clientDataJSON: v.optional(v.string()),
    signature: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await requireParent(ctx, a.token);
    await takeChallenge(ctx, me._id, "register", a.challenge);
    if (a.credentialId.length > 600 || a.publicKey.length > 1200) throw new ConvexError("מפתח לא תקין");
    if (a.alg !== -7 && a.alg !== -257) throw new ConvexError("המכשיר לא נתמך");
    let origin: string | undefined;
    if (a.kind === "webauthn") {
      if (!a.clientDataJSON) throw new ConvexError("האימות נכשל. נסו שוב.");
      const cd = parseClientData(a.clientDataJSON);
      if (cd.type !== "webauthn.create" || cd.challenge !== bytesToB64url(hexToBytes(a.challenge))) {
        throw new ConvexError("האימות נכשל. נסו שוב.");
      }
      if (!cd.origin || !originAllowed(cd.origin)) throw new ConvexError("האימות נכשל (כתובת לא מוכרת).");
      origin = cd.origin;
    } else {
      if (a.alg !== -7 || !a.signature) throw new ConvexError("האימות נכשל. נסו שוב.");
      if (!(await verifySig(a.publicKey, -7, b64ToBytes(a.signature), nativeMessage(a.challenge)))) {
        throw new ConvexError("האימות נכשל. נסו שוב.");
      }
    }
    // אותו מפתח שנרשם שוב (למשל אחרי איפוס באפליקציה) מחליף את הקודם.
    const existing = await ctx.db.query("bioKeys").withIndex("by_person", (q) => q.eq("personId", me._id)).collect();
    for (const k of existing) if (k.credentialId === a.credentialId) await ctx.db.delete(k._id);
    if (existing.length >= 10) throw new ConvexError("יותר מדי מכשירים רשומים");
    await ctx.db.insert("bioKeys", {
      personId: me._id, kind: a.kind, credentialId: a.credentialId, publicKey: a.publicKey, alg: a.alg,
      origin, label: a.label?.slice(0, 60), createdAt: Date.now(),
    });
    return { ok: true as const };
  },
});

// אתגר לפעולה רגישה. action מתאר בדיוק את הפעולה (למשל role:<id>:teen),
// כך שאי אפשר להשתמש באישור של פעולה אחת בשביל פעולה אחרת.
export const challenge = mutation({
  args: { token: v.string(), action: v.string(), credentialId: v.string() },
  handler: async (ctx, { token, action, credentialId }) => {
    const me = await requireParent(ctx, token);
    if (action.length > 200 || action === "register") throw new ConvexError("פעולה לא תקינה");
    const keys = await ctx.db.query("bioKeys").withIndex("by_person", (q) => q.eq("personId", me._id)).collect();
    if (!keys.some((k) => k.credentialId === credentialId)) return { ok: false as const, reason: "unknownKey" as const };
    return { ok: true as const, challenge: await newChallenge(ctx, me._id, action) };
  },
});

// מחיקת כל המכשירים הרשומים של ההורה (למשל אחרי החלפת טלפון).
export const forgetDevices = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requireParent(ctx, token);
    await purgeBiometric(ctx, me._id);
  },
});

export const proofValidator = v.object({
  challenge: v.string(),
  credentialId: v.string(),
  signature: v.string(),
  clientDataJSON: v.optional(v.string()),
  authenticatorData: v.optional(v.string()),
});

export type BioProof = {
  challenge: string; credentialId: string; signature: string;
  clientDataJSON?: string; authenticatorData?: string;
};

// בודק שההורה אישר את הפעולה הזו בטביעת אצבע / זיהוי פנים. זורק שגיאה אם לא.
export async function requireBiometric(ctx: MutationCtx, me: Member, action: string, proof: BioProof | undefined) {
  if (!proof) throw new ConvexError("צריך אישור בטביעת אצבע או בזיהוי פנים");
  await takeChallenge(ctx, me._id, action, proof.challenge);
  const keys = await ctx.db.query("bioKeys").withIndex("by_person", (q) => q.eq("personId", me._id)).collect();
  const key: Doc<"bioKeys"> | undefined = keys.find((k) => k.credentialId === proof.credentialId);
  if (!key) throw new ConvexError("המכשיר הזה לא רשום לאימות. רשמו אותו מחדש.");
  const fail = () => { throw new ConvexError("האימות בטביעת אצבע / זיהוי פנים נכשל"); };

  if (key.kind === "android") {
    if (!(await verifySig(key.publicKey, key.alg, b64ToBytes(proof.signature), nativeMessage(proof.challenge)))) fail();
  } else {
    if (!proof.clientDataJSON || !proof.authenticatorData) fail();
    const cdBytes = b64ToBytes(proof.clientDataJSON!);
    const cd = parseClientData(proof.clientDataJSON!);
    if (cd.type !== "webauthn.get") fail();
    if (cd.challenge !== bytesToB64url(hexToBytes(proof.challenge))) fail();
    if (!cd.origin || cd.origin !== key.origin || !originAllowed(cd.origin)) fail();
    const authData = b64ToBytes(proof.authenticatorData!);
    if (authData.length < 37) fail();
    const rpIdHash = await sha256(new TextEncoder().encode(new URL(cd.origin!).hostname));
    for (let i = 0; i < 32; i++) if (authData[i] !== rpIdHash[i]) fail();
    const flags = authData[32];
    // 0x01 = המשתמש נוכח, 0x04 = המשתמש אומת (אצבע / פנים / נעילת מסך של המכשיר).
    if (!(flags & 0x01) || !(flags & 0x04)) fail();
    const signed = concat(authData, await sha256(cdBytes));
    if (!(await verifySig(key.publicKey, key.alg, b64ToBytes(proof.signature), signed))) fail();
  }
  await ctx.db.patch(key._id, { lastUsedAt: Date.now() });
}
