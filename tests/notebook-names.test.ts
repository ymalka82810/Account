import { describe, expect, test } from "vitest";
// @ts-ignore - מודול JS של הפרונטאנד
import { nameMatch, normName } from "../src-react/lib/names.js";

describe("התאמת שמות בפנקס", () => {
  test("אותו שם אחרי נירמול", () => {
    expect(nameMatch("דני", " דני ")).toBe("same");
    expect(normName("דָּנִי")).toBe("דני");
  });
  test("שמות דומים", () => {
    expect(nameMatch("דני", "דניאל")).toBe("similar");
    expect(nameMatch("יוסי", "יוסף")).toBe("similar");
    expect(nameMatch("דני כהן", "דני")).toBe("similar");
  });
  test("שמות שונים", () => {
    expect(nameMatch("שרה", "משה")).toBeNull();
    expect(nameMatch("דני", "רוני")).toBeNull();
  });
  test("שמות קצרים (3 אותיות) שנבדלים באות אחת אינם דומים", () => {
    expect(nameMatch("אדם", "אדל")).toBeNull();
    expect(nameMatch("רון", "רום")).toBeNull();
    expect(nameMatch("אדם", "אדם")).toBe("same");
    expect(nameMatch("אדם", "אדם כהן")).toBe("similar");
  });
});

// @ts-ignore - מודול JS של הפרונטאנד
import { topPeople, searchPeople } from "../src-react/lib/names.js";

describe("הצעות שמות בטופס הרישום", () => {
  const people = [
    { id: "a", name: "אבא" }, { id: "b", name: "אביחי" }, { id: "c", name: "אדם" },
    { id: "d", name: "אבישי" }, { id: "e", name: "שמואל" }, { id: "f", name: "לא נרשם" },
  ];
  // מהחדש לישן
  const entries = [
    { personId: "e", paid: true }, { personId: "a", paid: true }, { personId: "b", paid: false },
    { personId: "a", paid: true }, { personId: "c", paid: true }, { personId: "a", paid: true },
    { personId: "b", paid: true }, { personId: "d", paid: false }, { personId: "d", paid: true },
  ];
  const nb = { people, entries };

  test("בלי הקלדה: רק שלושה, לפי שימוש ואז לפי האחרון", () => {
    expect(topPeople(nb).map((p: any) => p.id)).toEqual(["a", "b", "d"]);
  });
  test("מי שלא נרשם אליו אף פעם לא מוצע", () => {
    expect(topPeople(nb, 10).map((p: any) => p.id)).not.toContain("f");
  });
  test("בהקלדה: מי שיש איתו חוב פתוח קודם", () => {
    expect(searchPeople(nb, "אב").map((p: any) => p.id)).toEqual(["b", "d", "a"]);
  });
  test("בהקלדה: אין התאמה = רשימה ריקה, וריק = רשימה ריקה", () => {
    expect(searchPeople(nb, "זזז")).toEqual([]);
    expect(searchPeople(nb, "  ")).toEqual([]);
  });
});
