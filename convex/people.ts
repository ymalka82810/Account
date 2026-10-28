import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { proofValidator, purgeBiometric, requireBiometric } from "./biometric";
import { notify } from "./notify";
import { MAX_FAMILY_SIZE, cleanName, hashPin, randomHex, requireParent, requirePerson, requireSameFamily, validPin, pinRuleMessage } from "./lib";

export const add = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child"), v.literal("teen")),
    avatar: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    pin: v.optional(v.string()),
    proof: v.optional(proofValidator),
  },
  handler: async (ctx, { token, name, role, avatar, gender, pin, proof }) => {
    const me = await requireParent(ctx, token);
    const clean = cleanName(name);
    // הוספה ישירה בתור נער/ה או הורה היא כמו שינוי תפקיד: צריך אישור ביומטרי.
    if (role !== "child") {
      if (role === "parent" && !pin) throw new ConvexError("להורה חדש צריך לקבוע קוד סודי");
      await requireBiometric(ctx, me, `add:${role}:${clean}`, proof);
    }
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    if (members.some((p) => p.name === clean)) throw new ConvexError("כבר יש מישהו בשם הזה");
    if (pin !== undefined && !validPin(pin, role)) throw new ConvexError(pinRuleMessage(role));
    const personAvatar = avatar?.slice(0, 8);
    if (personAvatar && members.some((p) => p.avatar === personAvatar)) throw new ConvexError("הדמות הזו כבר תפוסה על ידי מישהו אחר במשפחה");
    const id = await ctx.db.insert("people", { familyId: me.familyId, name: clean, role, avatar: personAvatar, gender });
    if (pin) {
      const pinSalt = randomHex(16);
      await ctx.db.patch(id, { pinSalt, pinHash: await hashPin(pin, pinSalt), pinLength: pin.length });
    }
    return id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("people") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    if (me._id === id) throw new ConvexError("אי אפשר להסיר את עצמך");
    await requireSameFamily(ctx, me, id);
    const asFrom = await ctx.db.query("entries").withIndex("by_from", (q) => q.eq("from", id)).first();
    const asTo = await ctx.db.query("entries").withIndex("by_to", (q) => q.eq("to", id)).first();
    if (asFrom || asTo) throw new ConvexError("יש רשומות על שמו/ה. מחקו אותן קודם");
    for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", id)).collect()) {
      await ctx.db.delete(s._id);
    }
    for (const s of await ctx.db.query("pushSubs").withIndex("by_person", (q) => q.eq("personId", id)).collect()) {
      await ctx.db.delete(s._id);
    }
    await purgeFriends(ctx, id);
    await purgeBiometric(ctx, id);
    const rec = await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    for (const r of rec) if (r.from === id || r.to === id) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});

// הורה משנה תפקיד של בן/בת משפחה: ילד/ה, נער/ה או הורה. כל שינוי דורש אישור
// בטביעת אצבע או בזיהוי פנים של ההורה (biometric:requireBiometric), קשור בדיוק לשינוי הזה.
// מצב חברים קיים רק אצל נוער, אז מי שיוצא/ת מ"נער/ה" מאבד/ת אותו.
export const setRole = mutation({
  args: {
    token: v.string(), id: v.id("people"),
    role: v.union(v.literal("child"), v.literal("teen"), v.literal("parent")),
    proof: v.optional(proofValidator),
  },
  handler: async (ctx, { token, id, role, proof }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, id);
    if (p._id === me._id) throw new ConvexError("אי אפשר לשנות את התפקיד של עצמך");
    if (p.role === role) return;
    // הורה בלי קוד סודי היה נשאר פרופיל שאי אפשר להיכנס אליו (ואסור שילד יתפוס אותו).
    if (role === "parent" && !p.pinHash) throw new ConvexError(`קודם צריך לקבוע ל${p.name} קוד סודי`);
    await requireBiometric(ctx, me, `role:${id}:${role}`, proof);
    await ctx.db.patch(id, role === "teen"
      ? { role, teenRequested: undefined }
      : { role, teenRequested: undefined, friendsEnabled: false, friendsRequested: false, friendEmail: undefined });
    // הורה שהפך לילד/ה או לנער/ה לא צריך את המכשירים הביומטריים שלו.
    if (p.role === "parent") await purgeBiometric(ctx, id);
    // מי שהפך להורה לא ממשיך עם הסשן הקיים: הוא נכנס מחדש וקושר מכשיר בקוד קישור (הורה לא קשור לא פועל כהורה).
    if (role === "parent") {
      for (const s of await ctx.db.query("sessions").withIndex("by_person", (q) => q.eq("personId", id)).collect()) await ctx.db.delete(s._id);
    }
  },
});

// שינוי תפקיד הוא אך ורק ביוזמת הורה, דרך setRole למעלה. ילד/ה לא יכול/ה לבקש זאת -
// כדי שלא יהיה אפשר "לשגע" הורה בבקשות חוזרות.

// קביעת מגדר (לצורת פנייה מותאמת): אך ורק הורה קובע, ופעם אחת בלבד לכל אדם.
// אחרי שנקבע, הוא ננעל - גם ההורה לא יכול לשנות אותו יותר דרך האפליקציה.
export const setGender = mutation({
  args: { token: v.string(), id: v.id("people"), gender: v.union(v.literal("male"), v.literal("female")) },
  handler: async (ctx, { token, id, gender }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "parent") throw new ConvexError("רק הורים יכולים לקבוע את צורת הפנייה");
    const person = await requireSameFamily(ctx, me, id);
    if (person.gender) throw new ConvexError("צורת הפנייה כבר נקבעה ולא ניתנת לשינוי");
    await ctx.db.patch(id, { gender });
  },
});

// נוער בוחרים לעצמם את צבעי הניאון של המסך. חסר = ברירת המחדל (כחול+סגול).
export const setPalette = mutation({
  args: { token: v.string(), palette: v.optional(v.union(v.literal("blue"), v.literal("green"), v.literal("orange"))) },
  handler: async (ctx, { token, palette }) => {
    const me = await requirePerson(ctx, token);
    await ctx.db.patch(me._id, { palette });
  },
});

// כל אחד/ת בוחר/ת דמות לעצמו/ה. אי אפשר לבחור דמות שכבר תפוסה אצל בן משפחה אחר.
export const setAvatar = mutation({
  args: { token: v.string(), avatar: v.optional(v.string()) },
  handler: async (ctx, { token, avatar }) => {
    const me = await requirePerson(ctx, token);
    const clean = avatar ? avatar.slice(0, 8) : undefined;
    if (clean) {
      const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
      if (members.some((p) => p._id !== me._id && p.avatar === clean)) throw new ConvexError("הדמות הזו כבר תפוסה על ידי מישהו אחר במשפחה");
    }
    await ctx.db.patch(me._id, { avatar: clean });
  },
});
