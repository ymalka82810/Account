import { beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { pinLabel, pinMax, pinOk } from "../src-react/lib/pin.js";
import { fmtDate, fmtWait, prettyCode } from "../src-react/lib/helpers.js";
import { g } from "../src-react/lib/gender.js";
import { COUNTRIES as CLIENT_COUNTRIES, CURRENCIES as CLIENT_CURRENCIES, DEFAULT_CURRENCY, inList, localeFor } from "../src-react/lib/currencies.js";
import { COUNTRIES as SERVER_COUNTRIES, CURRENCIES as SERVER_CURRENCIES } from "../convex/currency";
import { validPin } from "../convex/lib";
import { COUNTRY_LANG, LANGUAGES } from "../src-react/i18n/index.js";
import { translateServer } from "../src-react/i18n/serverMessages.js";
import { getMemberships, upsertMembership, forgetMembershipByToken, otherMemberships, syncTargets } from "../src-react/lib/memberships.js";
import { loadDraft } from "../src-react/lib/draft.js";
import { getCards, upsertCard, removeCard, savedFamilies } from "../src-react/lib/cards.js";

// localStorage מזויף (הבדיקות רצות ב-Node)
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
beforeEach(() => store.clear());

describe("קוד סודי: הלקוח והשרת מסכימים", () => {
  it("pinMax לפי תפקיד", () => {
    expect(pinMax("parent")).toBe(8);
    expect(pinMax("child")).toBe(4);
    expect(pinMax("teen")).toBe(4);
  });
  it("pinOk זהה ל-validPin בשרת על מגוון קלטים", () => {
    const samples = ["", "1", "123", "1234", "12345", "1234567", "12345678", "123456789", "12a4", " 1234", "١٢٣٤"];
    for (const role of ["parent", "child", "teen"]) for (const s of samples) expect(pinOk(s, role)).toBe(validPin(s, role));
  });
  it("pinLabel מחזיר טקסט", () => {
    expect(pinLabel("parent")).toContain("8");
    expect(pinLabel("child")).toContain("4");
  });
});

describe("עזרי תצוגה", () => {
  it("fmtDate הופך ISO לפורמט ישראלי", () => {
    expect(fmtDate("2026-11-05")).toBe("05.11.2026");
  });
  it("prettyCode מוסיף מקף אחרי 5 תווים ומנקה תווים זרים", () => {
    expect(prettyCode("abcde23456")).toBe("ABCDE-23456");
    expect(prettyCode("ab-c")).toBe("ABC");
  });
  it("fmtWait מחזיר טקסט לא ריק לכל טווח", () => {
    for (const s of [10, 89, 90, 600, 3599, 3600, 7200, 86400]) expect(fmtWait(s).length).toBeGreaterThan(0);
  });
});

describe("צורת פנייה (gender)", () => {
  it("בוחר צורה לפי מגדר, וחוזר לצורה הכפולה כשאין", () => {
    // מחרוזות שאין להן תרגום, כדי לבדוק רק את הבחירה
    const f = ["test-m", "test-f", "test-n"] as const;
    expect(g("male", ...f)).toBe("test-m");
    expect(g("female", ...f)).toBe("test-f");
    expect(g(undefined, ...f)).toBe("test-n");
    expect(g(null, ...f)).toBe("test-n");
    expect(g("female", "שלום {x}", "היי {x}", "x", { x: "דנה" })).toContain("דנה");
  });
});

describe("מטבעות ומדינות: הלקוח והשרת מסכימים", () => {
  it("אותה רשימת מטבעות", () => {
    expect([...CLIENT_CURRENCIES].sort()).toEqual([...SERVER_CURRENCIES].sort());
  });
  it("לכל מדינה אותו מטבע בשני הצדדים", () => {
    expect(Object.fromEntries(CLIENT_COUNTRIES)).toEqual(SERVER_COUNTRIES);
  });
  it("לכל מדינה יש שפת ברירת מחדל שקיימת", () => {
    for (const [code] of CLIENT_COUNTRIES) {
      expect(COUNTRY_LANG[code], code).toBeDefined();
      expect(LANGUAGES[COUNTRY_LANG[code]], code).toBeDefined();
    }
  });
  it("localeFor: מדינה ברשימה מקבלת את המטבע שלה, אחרת דולר", () => {
    expect(localeFor("IL")).toEqual({ country: "IL", currency: "ILS" });
    expect(localeFor("FR")).toEqual({ country: "FR", currency: "EUR" });
    expect(localeFor("KE")).toEqual({ country: undefined, currency: DEFAULT_CURRENCY });
    expect(DEFAULT_CURRENCY).toBe("USD");
    expect(inList("IL")).toBe(true);
    expect(inList("KE")).toBe(false);
  });
});

describe("תרגום הודעות שרת", () => {
  it("הודעה עם ערך משתנה שומרת את הערך", () => {
    expect(translateServer("אי אפשר להחזיר יותר ממה שנשאר מהחוב (₪12.50)")).toContain("₪12.50");
    expect(translateServer("קודם צריך לקבוע לדנה קוד סודי")).toContain("דנה");
  });
  it("הודעה לא מוכרת חוזרת כמו שהיא (ולא נעלמת)", () => {
    expect(translateServer("הודעה חדשה שאין לה תרגום")).toBe("הודעה חדשה שאין לה תרגום");
  });
});

describe("קובצי שפה", () => {
  const dir = new URL("../src-react/i18n/locales/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const en = load("en.json");
  const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
  const forms = (v: any): string[] => (typeof v === "string" ? [v] : Object.values(v ?? {}) as string[]);

  it("לכל שפה בממשק יש קובץ (חוץ מעברית שהיא המקור)", () => {
    for (const code of Object.keys(LANGUAGES)) if (code !== "he") expect(files, code).toContain(`${code}.json`);
  });

  it.each(files)("%s: אין מפתחות שלא קיימים באנגלית", (f) => {
    const extra = Object.keys(load(f)).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it.each(files)("%s: אין תרגומים ריקים", (f) => {
    const empty = Object.entries(load(f)).filter(([, v]) => forms(v).some((s) => !s || !String(s).trim())).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it.each(files)("%s: כל {פרמטר} במקור קיים גם בתרגום (ולא נוספו פרמטרים)", (f) => {
    const bad: string[] = [];
    for (const [key, val] of Object.entries(load(f))) {
      const src = placeholders(key.split("|").join(" "));
      for (const s of forms(val)) {
        const got = placeholders(String(s)).filter((p) => p !== "{n}");
        const want = src.filter((p) => p !== "{n}");
        if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${key} => ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("משפחות במכשיר (memberships)", () => {
  const m = (personId: string, token: string, extra: object = {}) =>
    ({ personId, token, familyId: "f-" + personId, familyName: "משפחה", name: "דנה", avatar: "", role: "child", shared: false, ...extra });

  it("upsert מוסיף ומעדכן לפי מזהה אדם (כניסה חדשה מחליפה טוקן)", () => {
    upsertMembership(m("p1", "t1"));
    upsertMembership(m("p1", "t2"));
    expect(getMemberships().map((x) => x.token)).toEqual(["t2"]);
  });
  it("שומר עד 5 משפחות (הישנה ביותר יוצאת)", () => {
    for (let i = 1; i <= 6; i++) upsertMembership(m("p" + i, "t" + i));
    expect(getMemberships().map((x) => x.personId)).toEqual(["p2", "p3", "p4", "p5", "p6"]);
  });
  it("forget לפי טוקן, ו-otherMemberships מחזיר רק את האחרות", () => {
    upsertMembership(m("p1", "t1"));
    upsertMembership(m("p2", "t2"));
    expect(otherMemberships("t1").map((x) => x.token)).toEqual(["t2"]);
    forgetMembershipByToken("t1");
    expect(getMemberships().map((x) => x.token)).toEqual(["t2"]);
  });
  it("syncTargets: רק ילד/ה שאישר/ה שיתוף", () => {
    upsertMembership(m("p1", "t1", { shared: true }));
    upsertMembership(m("p2", "t2", { shared: false }));
    upsertMembership(m("p3", "t3", { shared: true, role: "teen" }));
    expect(syncTargets().map((x) => x.personId)).toEqual(["p1"]);
  });
  it("נתונים פגומים במכשיר לא מפילים את האפליקציה", () => {
    localStorage.setItem("kupa-memberships", "{not json");
    expect(getMemberships()).toEqual([]);
    localStorage.setItem("kupa-memberships", JSON.stringify([null, { personId: "x" }, m("p1", "t1")]));
    expect(getMemberships()).toHaveLength(1);
  });
});

describe("כרטיסי משפחה במכשיר (cards)", () => {
  it("כרטיס אחד לכל משפחה; עדכון מחליף", () => {
    upsertCard({ familyId: "f1", name: "א", card: "c1" });
    upsertCard({ familyId: "f1", name: "א", card: "c2" });
    expect(getCards()).toEqual([{ familyId: "f1", name: "א", card: "c2" }]);
  });
  it("removeCard מוחק רק את הכרטיס המבוקש", () => {
    upsertCard({ familyId: "f1", name: "א", card: "c1" });
    upsertCard({ familyId: "f2", name: "ב", card: "c2" });
    removeCard("c1");
    expect(getCards().map((c) => c.familyId)).toEqual(["f2"]);
  });
  it("savedFamilies מאחד כרטיסים וכניסות ומסנן את המשפחה הנוכחית", () => {
    upsertCard({ familyId: "f1", name: "ישן", card: "c1" });
    upsertCard({ familyId: "f2", name: "ב", card: "c2" });
    const list = savedFamilies([{ familyId: "f1", familyName: "חדש", token: "t1" }, { familyId: "f3", familyName: "ג", token: "t3" }], "f2");
    expect(list).toEqual([
      { familyId: "f1", name: "חדש", card: "c1", token: "t1" },
      { familyId: "f3", name: "ג", card: "", token: "t3" },
    ]);
  });
  it("נתונים פגומים מחזירים רשימה ריקה", () => {
    localStorage.setItem("kupa-cards", "oops");
    expect(getCards()).toEqual([]);
  });
});


describe("טיוטות", () => {
  const put = (v: unknown, at: number) => localStorage.setItem("k", JSON.stringify({ v, at }));
  it("טיוטה תקינה נטענת", () => {
    put({ name: "דנה" }, Date.now());
    expect(loadDraft("k")).toEqual({ name: "דנה" });
    expect(localStorage.getItem("k")).not.toBeNull();
  });
  it("טיוטה שפגה, פגומה או לא תקינה נמחקת מהמכשיר", () => {
    put({ name: "ישן" }, Date.now() - 4 * 24 * 60 * 60 * 1000);
    expect(loadDraft("k")).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
    localStorage.setItem("k", "{לא json");
    expect(loadDraft("k")).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
    localStorage.setItem("k", JSON.stringify({ v: "טקסט", at: Date.now() }));
    expect(loadDraft("k")).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });
  it("אין טיוטה: null", () => { expect(loadDraft("k")).toBeNull(); });
});
