import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { hashPin, hashToken } from "../../convex/lib";

// convex-test מזהה את תיקיית convex לפי נתיב מודול תחת _generated, שלא קיים אצלנו (ראו vite.config.js).
// מוסיפים לו מפתח מזויף כדי שיזהה את השורש.
const modules = {
  ...import.meta.glob("../../convex/**/*.ts"),
  "../../convex/_generated/api.js": () => Promise.resolve({}),
};

export const newDb = () => convexTest(schema, modules);
export type T = ReturnType<typeof newDb>;

// קוד הצטרפות תקין (10 תווים) שנגזר משם המשפחה.
export const familyCode = (name: string) => name.toUpperCase().padEnd(10, "X");

type Role = "parent" | "child" | "teen";

// משפחה עם אנשים. לכל אחד נוצרת כניסה (session) עם טוקן = "tok-<משפחה>-<שם>".
export async function seedFamily(t: T, name: string, members: { name: string; role: Role; pin?: string }[], currency?: string) {
  // convex-test לא מקבל מפתחות בעברית בערך שחוזר מ-t.run, אז מחזירים רשימה ובונים את המפות בחוץ.
  const { familyId, rows } = await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("families", { name, childCode: familyCode(name), createdAt: Date.now(), currency });
    const rows: { name: string; id: any; token: string }[] = [];
    for (const m of members) {
      const id = await ctx.db.insert("people", { familyId, name: m.name, role: m.role });
      if (m.pin) await ctx.db.patch(id, { pinSalt: "salt", pinHash: await hashPin(m.pin, "salt") });
      const token = `tok-${name}-${m.name}`;
      await ctx.db.insert("sessions", { personId: id, tokenHash: await hashToken(token), expiresAt: Date.now() + 3_600_000 });
      rows.push({ name: m.name, id, token });
    }
    return { familyId, rows };
  });
  const ids: Record<string, any> = {};
  const tokens: Record<string, string> = {};
  for (const r of rows) { ids[r.name] = r.id; tokens[r.name] = r.token; }
  return { familyId, ids, tokens };
}

export const setRates = (t: T, rates: Record<string, number>) =>
  t.run(async (ctx) => { await ctx.db.insert("fxRates", { rates, source: "test", fetchedAt: Date.now() }); });
