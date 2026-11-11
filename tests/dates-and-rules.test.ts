import { describe, expect, it } from "vitest";
import {
  addDays, advanceDate, cleanFamilyName, cleanName, deviceKey, firstAfter, generateCode,
  maskEmail, normalizeCode, normalizeEmail, validEmail, validPin, weekdayOf,
} from "../convex/lib";

describe("חישובי תאריכים (לרישומים קבועים)", () => {
  it("addDays עובר חודשים, שנים ושנה מעוברת", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("weekdayOf: 0 = ראשון", () => {
    expect(weekdayOf("2026-11-01")).toBe(0); // יום ראשון
    expect(weekdayOf("2026-11-07")).toBe(6); // שבת
  });

  it("firstAfter שבועי: תמיד אחרי היום, גם כשהיום הוא אותו יום בשבוע", () => {
    expect(firstAfter("2026-11-01", "weekly", 0)).toBe("2026-11-08");
    expect(firstAfter("2026-11-01", "weekly", 3)).toBe("2026-11-04");
  });

  it("firstAfter חודשי: החודש אם היום עוד לא עבר, אחרת בחודש הבא (גם מעבר שנה)", () => {
    expect(firstAfter("2026-11-05", "monthly", undefined, 10)).toBe("2026-11-10");
    expect(firstAfter("2026-11-10", "monthly", undefined, 10)).toBe("2026-12-10");
    expect(firstAfter("2026-12-20", "monthly", undefined, 1)).toBe("2027-01-01");
  });

  it("advanceDate: שבוע קדימה או חודש קדימה באותו יום בחודש", () => {
    expect(advanceDate("2026-12-28", "weekly")).toBe("2027-01-04");
    expect(advanceDate("2026-12-15", "monthly", 15)).toBe("2027-01-15");
    expect(advanceDate("2026-01-28", "monthly", 28)).toBe("2026-02-28");
  });
});

describe("כללי קוד סודי", () => {
  it("ילדים ונוער: בדיוק 4 ספרות", () => {
    for (const role of ["child", "teen", undefined]) {
      expect(validPin("1234", role)).toBe(true);
      expect(validPin("123", role)).toBe(false);
      expect(validPin("12345", role)).toBe(false);
      expect(validPin("12a4", role)).toBe(false);
    }
  });
  it("הורה: 4 עד 8 ספרות", () => {
    expect(validPin("1234", "parent")).toBe(true);
    expect(validPin("12345678", "parent")).toBe(true);
    expect(validPin("123456789", "parent")).toBe(false);
    expect(validPin("123", "parent")).toBe(false);
    expect(validPin(" 1234", "parent")).toBe(false);
  });
});

describe("ניקוי שמות וקודים", () => {
  it("cleanName מקצץ רווחים ודוחה ריק או ארוך מ-20", () => {
    expect(cleanName("  דנה   כהן ")).toBe("דנה כהן");
    expect(() => cleanName("   ")).toThrow("שם לא תקין");
    expect(() => cleanName("א".repeat(21))).toThrow("שם לא תקין");
    expect(cleanName("א".repeat(20))).toHaveLength(20);
  });
  it("cleanFamilyName מאפשר עד 30 תווים", () => {
    expect(cleanFamilyName(" משפחת  לוי ")).toBe("משפחת לוי");
    expect(() => cleanFamilyName("א".repeat(31))).toThrow("שם המשפחה לא תקין");
  });
  it("normalizeCode: אותיות גדולות, בלי מקפים ורווחים", () => {
    expect(normalizeCode("abcde-fgh 23")).toBe("ABCDEFGH23");
    expect(normalizeCode("x".repeat(60))).toHaveLength(40);
  });
  it("deviceKey: מזהה ריק או זדוני הופך למפתח בטוח", () => {
    expect(deviceKey(undefined)).toBe("code-fail:anon");
    expect(deviceKey("<script>")).toBe("code-fail:script");
    expect(deviceKey("a".repeat(100))).toBe("code-fail:" + "a".repeat(40));
  });
});

describe("מייל", () => {
  it("normalizeEmail ו-validEmail", () => {
    expect(normalizeEmail("  Dad@Example.COM ")).toBe("dad@example.com");
    expect(validEmail("dad@example.com")).toBe(true);
    expect(validEmail("dad@example")).toBe(false);
    expect(validEmail("dad example@x.com")).toBe(false);
    expect(validEmail("@example.com")).toBe(false);
    expect(validEmail("a".repeat(250) + "@x.com")).toBe(false);
  });
  it("maskEmail מסתיר את השם", () => {
    expect(maskEmail("yochai@gmail.com")).toBe("y***@gmail.com");
  });
  it("generateCode: תמיד 6 ספרות (כולל אפסים מובילים)", () => {
    for (let i = 0; i < 300; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});
