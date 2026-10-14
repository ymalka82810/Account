import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { purgeFriends } from "./friends";
import { notify } from "./notify";
import { MAX_FAMILY_SIZE, cleanName, hashPin, randomHex, requireParent, requirePerson, requireSameFamily, validPin } from "./lib";

export const add = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child"), v.literal("teen")),
    avatar: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, { token, name, role, avatar, gender, pin }) => {
    const me = await requireParent(ctx, token);
    const clean = cleanName(name);
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    if (members.length >= MAX_FAMILY_SIZE) throw new ConvexError("המשפחה מלאה");
    if (members.some((p) => p.name === clean)) throw new ConvexError("כבר יש מישהו בשם הזה");
    if (pin !== undefined && !validPin(pin)) throw new ConvexError("הקוד צריך להיות 4 ספרות");
    const personAvatar = avatar?.slice(0, 8);
    if (personAvatar && members.some((p) => p.avatar === personAvatar)) throw new ConvexError("הדמות הזו כבר תפוסה על ידי מישהו אחר במשפחה");
    const id = await ctx.db.insert("people", { familyId: me.familyId, name: clean, role, avatar: personAvatar, gender });
    if (pin) {
      const pinSalt = randomHex(16);
      await ctx.db.patch(id, { pinSalt, pinHash: await hashPin(pin, pinSalt), pinPlain: pin });
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
    const rec = await ctx.db.query("recurring").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    for (const r of rec) if (r.from === id || r.to === id) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});

// הורה מציג את הקוד הסודי הנוכחי של ילד/ה (בטקסט גלוי, לכפתור "הצג קוד").
export const getPin = mutation({
  args: { token: v.string(), id: v.id("people") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, id);
    return p.pinPlain ?? null;
  },
});

// הורה משנה בין ילד/ה לנער/ה. מי שחוזר להיות ילד/ה מאבד/ת את מצב החברים.
export const setRole = mutation({
  args: { token: v.string(), id: v.id("people"), role: v.union(v.literal("child"), v.literal("teen")) },
  handler: async (ctx, { token, id, role }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, id);
    if (p.role === "parent") throw new ConvexError("אי אפשר לשנות תפקיד של הורה");
    if (p.role === role) return;
    await ctx.db.patch(id, role === "child"
      ? { role, teenRequested: false, friendsEnabled: false, friendsRequested: false, friendEmail: undefined }
      : { role, teenRequested: false });
  },
});

// ילד/ה מבקש/ת להפוך לנער/ה. ההורה מאשר/ת דרך setRole או דוחה/ה דרך declineTeen.
export const requestTeen = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await requirePerson(ctx, token);
    if (me.role !== "child") throw new ConvexError("הבקשה היא לילדים בלבד");
    if (me.teenRequested) return;
    await ctx.db.patch(me._id, { teenRequested: true });
    const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
    await notify(ctx, members.filter((p) => p.role === "parent").map((p) => p._id), "בקשה לעבור לנוער", `${me.name} מבקש/ת להפוך לנער/ה. צריך את האישור שלך.`);
  },
});

export const declineTeen = mutation({
  args: { token: v.string(), id: v.id("people") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const p = await requireSameFamily(ctx, me, id);
    if (!p.teenRequested) return;
    await ctx.db.patch(id, { teenRequested: false });
    await notify(ctx, [id], "בקשה לעבור לנוער", "ההורים לא אישרו את הבקשה כרגע.");
  },
});

// קביעת מגדר (לצורת פנייה מותאמת): האדם עצמו/ה או הורה יכולים לקבוע. חסר = ללא ציון.
export const setGender = mutation({
  args: { token: v.string(), id: v.id("people"), gender: v.optional(v.union(v.literal("male"), v.literal("female"))) },
  handler: async (ctx, { token, id, gender }) => {
    const me = await requirePerson(ctx, token);
    if (me._id !== id) {
      if (me.role !== "parent") throw new ConvexError("רק הורים יכולים לעשות את זה");
      await requireSameFamily(ctx, me, id);
    }
    await ctx.db.patch(id, { gender });
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
