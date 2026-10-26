import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { MAX_AMOUNT, requireParent, requirePerson } from "./lib";
import { entryLine, entryTextFor, notify } from "./notify";
import { internal } from "./_generated/api";
import { LEGACY_CURRENCY, Rates, convert, curOf, fmtMoney, isCurrency, paidOnDebt } from "./currency";
import { loadRates } from "./fx";

// סכום מקסימלי לרשומה: 10,000 ש"ח או השווי שלהם במטבע אחר (בלי שערים: גבול רחב).
function amountOk(amount: number, currency: string, rates: Rates | null): boolean {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  const ils = convert(amount, currency, LEGACY_CURRENCY, rates);
  return ils === null ? amount <= 100 * MAX_AMOUNT : ils <= MAX_AMOUNT * 1.001;
}

const UNDO_MS = 10 * 60 * 1000;

export const add = mutation({
  args: {
    token: v.string(),
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(),
    // מטבע הרשומה. חסר = המטבע הראשי של המשפחה. החזר נרשם תמיד במטבע הראשי ומומר לחוב לפי השער הנוכחי.
    currency: v.optional(v.string()),
    note: v.string(),
    date: v.string(),
    // החזר על חוב מסוים (רשומת חוב שכבר אושרה).
    debtId: v.optional(v.id("entries")),
  },
  handler: async (ctx, { token, currency: askedCurrency, ...e }) => {
    const me = await requirePerson(ctx, token);
    const family = await ctx.db.get(me.familyId);
    const base = family?.currency ?? LEGACY_CURRENCY;
    const currency = e.kind === "payment" ? base : (askedCurrency ?? base);
    if (!isCurrency(currency)) throw new ConvexError("מטבע לא נתמך");
    const fxNow = await loadRates(ctx);
    const rates = fxNow?.rates ?? null;
    // ילדים רושמים רק דברים שקשורים אליהם. הורים יכולים לרשום לכולם.
    if (me.role !== "parent" && e.from !== me._id && e.to !== me._id) {
      throw new ConvexError("אפשר לרשום רק חובות שקשורים אליך");
    }
    if (e.from === e.to) throw new ConvexError("אדם לא יכול להיות חייב לעצמו");
    if (!amountOk(e.amount, currency, rates)) throw new ConvexError("סכום לא תקין");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ConvexError("תאריך לא תקין");
    const note = e.note.trim();
    if (note.length > 80) throw new ConvexError("ההערה ארוכה מדי");
    // שני האנשים חייבים להיות באותה משפחה כמו המחובר/ת.
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    if (!from || !to || from.familyId !== me.familyId || to.familyId !== me.familyId) throw new ConvexError("אדם לא קיים");

    // בהחזר: שומרים את שערי ההמרה של הרגע הזה לכל מטבע של חוב באותו כיוון, כדי שהחלוקה של
    // ההחזר על חובות במטבע אחר (למשל 100 דולר) תהיה לפי השער ביום התשלום ולא תזוז אחר כך.
    let fx: Rates | undefined;
    if (e.kind === "payment") {
      // רק החובות של הזוג הזה (אינדקס by_from_to_kind), בלי ההחזרים ובלי שאר רשומות המשפחה.
      const pair = await ctx.db.query("entries").withIndex("by_from_to_kind", (q) => q.eq("from", e.from).eq("to", e.to).eq("kind", "debt")).collect();
      const curs = new Set(pair.filter((x) => x.familyId === me.familyId).map(curOf));
      curs.add(currency);
      if (curs.size > 1) {
        if (!rates) {
          await ctx.scheduler.runAfter(0, internal.fx.refresh, {});
          throw new ConvexError("שערי ההמרה עוד לא נטענו. נסו שוב בעוד רגע.");
        }
        fx = {};
        for (const c of curs) if (rates[c]) fx[c] = rates[c];
      }

      // החזר שמקושר לחוב: החוב חייב להיות חוב מאושר באותה משפחה, באותו כיוון, וההחזר לא יעלה על מה שנשאר ממנו.
      if (e.debtId) {
        const debt = await ctx.db.get(e.debtId);
        if (!debt || debt.kind !== "debt" || debt.familyId !== me.familyId || debt.status === "pending") {
          throw new ConvexError("החוב לא נמצא");
        }
        if (debt.from !== e.from || debt.to !== e.to) throw new ConvexError("ההחזר לא מתאים לחוב הזה");
        const linked = await ctx.db.query("entries").withIndex("by_debt", (q) => q.eq("debtId", debt._id)).collect();
        const remaining = debt.amount - paidOnDebt(debt, linked, rates);
        if (remaining < 0.5) throw new ConvexError("החוב הזה כבר שולם");
        const inDebtCur = convert(e.amount, currency, curOf(debt), fx ?? rates);
        if (inDebtCur === null) throw new ConvexError("אין שער המרה למטבע של החוב");
        // מרווח קטן לעיגול ולשינוי קל בשער בין המסך לשרת.
        if (inDebtCur > remaining * 1.02 + 1) {
          const max = convert(remaining, curOf(debt), currency, fx ?? rates)!;
          throw new ConvexError(`אי אפשר להחזיר יותר ממה שנשאר מהחוב (${fmtMoney(Math.ceil(max), currency)})`);
        }
      }
    } else if (e.debtId) {
      throw new ConvexError("אפשר לקשר לחוב רק החזר");
    }

    // מה שילד/ה רושם/ת ממתין לאישור הורה. מה שהורה רושם מאושר מיד.
    const pending = me.role !== "parent";
    const id = await ctx.db.insert("entries", {
      ...e, note, currency, ...(fx ? { fx } : {}), familyId: me.familyId, createdBy: me._id, createdAt: Date.now(),
      ...(pending ? { status: "pending" as const } : {}),
    });

    const names = { from: from.name, to: to.name, creator: me.name };
    const ec = { ...e, currency };
    if (pending) {
      const members = await ctx.db.query("people").withIndex("by_family", (q) => q.eq("familyId", me.familyId)).collect();
      const parents = members.filter((p) => p.role === "parent" && p._id !== me._id).map((p) => p._id);
      await notify(ctx, parents, "ממתין לאישור ⏳", `${me.name} רשם/ה: ${entryLine(ec, names)}`);
    } else {
      for (const r of [e.from, e.to]) {
        if (r !== me._id) await notify(ctx, [r], "הקופה המשפחתית 🪙", entryTextFor(r, ec, names));
      }
    }
    return id;
  },
});

// הורה מאשר רשומה שילד/ה רשם/ה. מרגע האישור היא נספרת ביתרות.
export const approve = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId || e.status !== "pending") return;
    await ctx.db.patch(id, { status: undefined });
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    const creator = e.createdBy ? await ctx.db.get(e.createdBy) : null;
    if (!from || !to) return;
    const names = { from: from.name, to: to.name, creator: creator?.name ?? "מישהו" };
    if (creator && creator._id !== me._id) {
      await notify(ctx, [creator._id], "אושר ✅", entryLine(e, names));
    }
    for (const r of [e.from, e.to]) {
      if (r !== me._id && r !== e.createdBy) await notify(ctx, [r], "הקופה המשפחתית 🪙", entryTextFor(r, e, names));
    }
  },
});

// הורה דוחה רשומה שממתינה לאישור. היא נמחקת, ומי שיצר/ה אותה מקבל/ת הודעה.
export const reject = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requireParent(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId || e.status !== "pending") return;
    await ctx.db.delete(id);
    const from = await ctx.db.get(e.from);
    const to = await ctx.db.get(e.to);
    if (e.createdBy && e.createdBy !== me._id && from && to) {
      await notify(ctx, [e.createdBy], "לא אושר", entryLine(e, { from: from.name, to: to.name, creator: me.name }));
    }
  },
});

// הורים מוחקים כל רשומה. מי שיצר/ה רשומה יכול/ה לבטל אותה בכל שלב כל עוד היא ממתינה לאישור, או ב-10 הדקות הראשונות.
export const remove = mutation({
  args: { token: v.string(), id: v.id("entries") },
  handler: async (ctx, { token, id }) => {
    const me = await requirePerson(ctx, token);
    const e = await ctx.db.get(id);
    if (!e || e.familyId !== me.familyId) return;
    const mine = e.createdBy === me._id && (e.status === "pending" || Date.now() - (e.createdAt ?? 0) < UNDO_MS);
    if (me.role !== "parent" && !mine) throw new ConvexError("אפשר לבטל רק ב-10 הדקות הראשונות, או לבקש מהורה");
    // מחיקת חוב: ההחזרים שקושרו אליו נשארים כהחזרים כלליים, כדי שהיתרה לא תשתנה.
    if (e.kind === "debt") {
      const linked = await ctx.db.query("entries").withIndex("by_debt", (q) => q.eq("debtId", id)).collect();
      for (const x of linked) await ctx.db.patch(x._id, { debtId: undefined });
    }
    await ctx.db.delete(id);
  },
});
