import { describe, expect, it } from "vitest";
import { applyKey, kindOf, isKbTarget, layoutOrder, LAYOUTS, symbolRows, wantsAutoShift, hasCase, shiftChar } from "../src-react/lib/keyboard.js";

// אלמנט מזויף: מספיק ל-kindOf ול-isKbTarget (בלי DOM).
const el = (attrs: Record<string, string> = {}, tag = "INPUT", extra: any = {}) => ({
  nodeType: 1, tagName: tag, dataset: extra.dataset ?? {}, disabled: false, readOnly: false,
  getAttribute: (k: string) => (k in attrs ? attrs[k] : null), ...extra,
});
const st = (value: string, start = value.length, end = start, max = Infinity) => ({ value, start, end, max });

describe("סוג המקלדת לפי השדה", () => {
  it("קוד סודי ושדות מספר מקבלים מקלדת מספרים", () => {
    expect(kindOf(el({ type: "password", inputmode: "numeric" }))).toBe("num");
    expect(kindOf(el({ type: "text", inputmode: "numeric" }))).toBe("num");
    expect(kindOf(el({ type: "tel" }))).toBe("num");
  });
  it("סכום מקבל מספרים עם נקודה", () => {
    expect(kindOf(el({ type: "text", inputmode: "decimal" }))).toBe("dec");
    expect(kindOf(el({ type: "number" }))).toBe("dec");
  });
  it("אחרי שהמקלדת הסתירה את ה-inputmode, הסוג נקבע לפי המקור שנשמר", () => {
    expect(kindOf(el({ type: "text", inputmode: "none" }, "INPUT", { dataset: { kbIm: "numeric" } }))).toBe("num");
    expect(kindOf(el({ type: "text", inputmode: "none" }, "INPUT", { dataset: { kbIm: "" } }))).toBe("text");
  });
  it("מייל וקוד משפחה מקבלים מקלדת לועזית, ושם או הערה מקבלים טקסט חופשי", () => {
    expect(kindOf(el({ type: "email" }))).toBe("email");
    expect(kindOf(el({ type: "text", dir: "ltr", autocapitalize: "characters" }))).toBe("latin");
    expect(kindOf(el({ type: "text" }))).toBe("text");
    expect(kindOf(el({}, "TEXTAREA"))).toBe("text");
  });
  it("data-kb גובר על הזיהוי", () => {
    expect(kindOf(el({ type: "text" }, "INPUT", { dataset: { kb: "num" } }))).toBe("num");
  });
  it("רק שדות הקלדה מקבלים את המקלדת", () => {
    expect(isKbTarget(el({ type: "text" }))).toBe(true);
    expect(isKbTarget(el({}, "TEXTAREA"))).toBe(true);
    expect(isKbTarget(el({ type: "checkbox" }))).toBe(false);
    expect(isKbTarget(el({ type: "date" }))).toBe(false);
    expect(isKbTarget(el({ type: "text" }, "INPUT", { readOnly: true }))).toBe(false);
    expect(isKbTarget(el({ type: "text" }, "INPUT", { dataset: { nativeKb: "" } }))).toBe(false);
    expect(isKbTarget(el({}, "BUTTON"))).toBe(false);
  });
});

describe("הקלדה ומחיקה", () => {
  it("מוסיף במקום הסמן ומקדם אותו", () => {
    expect(applyKey(st("אב", 1), "ג", "text")).toEqual({ value: "אגב", caret: 2 });
  });
  it("תו מחליף את הטקסט המסומן", () => {
    expect(applyKey(st("abcd", 1, 3), "X", "text")).toEqual({ value: "aXd", caret: 2 });
  });
  it("מחיקה מוחקת תו לפני הסמן או את הבחירה, ולא עושה כלום בתחילת השדה", () => {
    expect(applyKey(st("abc"), "del", "text")).toEqual({ value: "ab", caret: 2 });
    expect(applyKey(st("abcd", 1, 3), "del", "text")).toEqual({ value: "ad", caret: 1 });
    expect(applyKey(st("abc", 0), "del", "text")).toBeNull();
  });
  it("אימוג'י נמחק בשלמותו", () => {
    expect(applyKey(st("a😀"), "del", "text")).toEqual({ value: "a", caret: 1 });
  });
  it("מכבד אורך מרבי, גם כשיש בחירה", () => {
    expect(applyKey(st("1234", 4, 4, 4), "5", "num")).toBeNull();
    expect(applyKey(st("1234", 0, 4, 4), "5", "num")).toEqual({ value: "5", caret: 1 });
  });
  it("במקלדת מספרים נכנסות ספרות בלבד", () => {
    expect(applyKey(st("1"), "a", "num")).toBeNull();
    expect(applyKey(st("1"), ".", "num")).toBeNull();
    expect(applyKey(st("1"), "2", "num")).toEqual({ value: "12", caret: 2 });
  });
  it("בסכום מותרת נקודה אחת בלבד", () => {
    expect(applyKey(st("1"), ".", "dec")).toEqual({ value: "1.", caret: 2 });
    expect(applyKey(st("1.5"), ".", "dec")).toBeNull();
    expect(applyKey(st("1.5", 0, 3), ".", "dec")).toEqual({ value: ".", caret: 1 });
    expect(applyKey(st(""), "x", "dec")).toBeNull();
  });
  it("במייל ובקוד אין רווחים", () => {
    expect(applyKey(st("a"), " ", "email")).toBeNull();
    expect(applyKey(st("a"), " ", "latin")).toBeNull();
    expect(applyKey(st("a"), " ", "text")).toEqual({ value: "a ", caret: 2 });
  });
});

describe("פריסות", () => {
  it("בעברית: עברית ואנגלית חוזר חלילה, בלי מקלדת המערכת", () => {
    expect(layoutOrder("he", "text")).toEqual(["he", "en"]);
  });
  it("לכל שפת ממשק (חוץ מסינית) יש פריסה משלה, והסבב הוא פריסת השפה ואנגלית", () => {
    for (const l of ["fr", "de", "es", "it", "pt", "nl", "sv", "nb", "da", "pl", "hu", "cs", "tr", "ru", "uk", "el", "ar", "hi", "th", "ja"]) {
      expect(layoutOrder(l, "text")).toEqual([l, "en"]);
      expect(LAYOUTS[l as keyof typeof LAYOUTS].length).toBeGreaterThanOrEqual(3);
    }
  });
  it("סינית ואנגלית: אנגלית ומקלדת המערכת (סינית דורשת מערכת קלט)", () => {
    expect(layoutOrder("zh", "text")).toEqual(["en", "sys"]);
    expect(layoutOrder("en", "text")).toEqual(["en", "sys"]);
  });
  it("צרפתית היא AZERTY וגרמנית QWERTZ", () => {
    expect(LAYOUTS.fr[0]).toBe("azertyuiop");
    expect(LAYOUTS.de[0].startsWith("qwertz")).toBe(true);
  });
  it("בפריסה אין אותו תו פעמיים", () => {
    for (const [name, rows] of Object.entries(LAYOUTS)) {
      const all = [...rows.join("")];
      expect(new Set(all).size, name).toBe(all.length);
    }
  });
  it("shift: טורקית i ← İ, הינדי נשפה, יפנית קאנה קטנה, תאילנדית שכבה שנייה", () => {
    expect(shiftChar("tr", "i")).toBe("İ");
    expect(shiftChar("tr", "ı")).toBe("I");
    expect(shiftChar("hi", "क")).toBe("ख");
    expect(shiftChar("ja", "つ")).toBe("っ");
    expect(shiftChar("th", "ๆ")).toBe("๐");
    expect(shiftChar("he", "א")).toBe("א");
  });
  it("ניקוד יפני מתחבר לתו שלפניו", () => {
    expect(applyKey(st("か"), "\u3099", "text")).toEqual({ value: "が", caret: 1 });
    expect(applyKey(st("は"), "\u309A", "text")).toEqual({ value: "ぱ", caret: 1 });
  });
  it("מייל וקוד נשארים באנגלית בלבד", () => {
    expect(layoutOrder("he", "email")).toEqual(["en"]);
    expect(layoutOrder("he", "latin")).toEqual(["en"]);
  });
  it("בפריסה העברית יש את כל 27 האותיות כולל סופיות, בלי כפילויות", () => {
    const he = LAYOUTS.he.join("");
    expect([...he].sort().join("")).toBe([..."אבגדהוזחטיכלמנסעפצקרשתךםןףץ"].sort().join(""));
  });
  it("לעברית וערבית אין אותיות גדולות", () => {
    expect(hasCase("he")).toBe(false);
    expect(hasCase("ar")).toBe(false);
    expect(hasCase("en")).toBe(true);
  });
  it("אות גדולה בתחילת שדה ואחרי סוף משפט", () => {
    expect(wantsAutoShift("")).toBe(true);
    expect(wantsAutoShift("שלום. ")).toBe(true);
    expect(wantsAutoShift("שלום")).toBe(false);
  });
  it("בדף הסימנים יש אותיות עם סימנים לשפות לטיניות", () => {
    expect(symbolRows("de", "text").flat()).toContain("ä");
    expect(symbolRows("en", "text").flat()).not.toContain("ä");
    expect(symbolRows("en", "email").flat()).toContain("@");
  });
});

import { currentWord, suggest, applySuggestion } from "../src-react/lib/keyboard.js";

describe("השלמת מילים", () => {
  it("מזהה את המילה שלפני הסמן", () => {
    expect(currentWord("שלום עול")).toBe("עול");
    expect(currentWord("hello wor")).toBe("wor");
    expect(currentWord("שלום ")).toBe("");
    expect(currentWord("don't")).toBe("don't");
  });
  it("מציע מילים שמתחילות באותן אותיות, אישיות קודם", () => {
    expect(suggest("גל", [["גלית"], ["גלידה", "גלריה", "גלגל", "גלים"]])).toEqual(["גלית", "גלידה", "גלריה"]);
  });
  it("לא מציע לפני שתי אותיות, ולא את המילה שכבר הוקלדה", () => {
    expect(suggest("ג", [["גלידה"]])).toEqual([]);
    expect(suggest("גלידה", [["גלידה"]])).toEqual([]);
  });
  it("שומר על אות ראשונה גדולה", () => {
    expect(suggest("Ic", [["ice", "icy"]])).toEqual(["Ice", "Icy"]);
  });
  it("השלמה מחליפה את תחילת המילה ומוסיפה רווח", () => {
    const s = { value: "קניתי גל", start: 8, end: 8, max: Infinity };
    expect(applySuggestion(s, "גלידה")).toEqual({ value: "קניתי גלידה ", caret: 12 });
  });
  it("לא מכפילה רווח קיים ומכבדת אורך מרבי", () => {
    expect(applySuggestion({ value: "גל אחר", start: 2, end: 2, max: Infinity }, "גלידה")).toEqual({ value: "גלידה אחר", caret: 5 });
    expect(applySuggestion({ value: "גל", start: 2, end: 2, max: 4 }, "גלידה")).toBeNull();
  });
});

// באנדרואיד inputmode="none" לא מסתיר את מקלדת המערכת בשדה type="number" (עולה מקלדת המספרים של הטלפון מעל שלנו),
// לכן שדות סכום הם type="text" עם inputMode="decimal" ו-data-kb="dec".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
describe("אין שדות type=number באפליקציה", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".jsx") ? [join(d, f)] : []));
  it("אף קומפוננטה לא משתמשת ב-type=\"number\"", () => {
    const bad = walk("src-react").filter((f) => /type=["']number["']/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("שדה סכום עם data-kb=dec מקבל מקלדת עשרונית", () => {
    expect(kindOf(el({ type: "text", inputmode: "decimal" }, "INPUT", { dataset: { kb: "dec" } }))).toBe("dec");
  });
});
