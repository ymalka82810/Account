import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// notebook.js מושך מודולים שנוגעים ב-window כבר בטעינה.
vi.hoisted(() => { (globalThis as any).window = globalThis; });
const { ageOf, isAdult, parseBirth } = await import("../src-react/lib/notebook.js");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 15, 12)); });
afterEach(() => vi.useRealTimers());

describe("parseBirth", () => {
  it("דוחה פורמט, תאריך לא קיים, עתיד ולפני 1900", () => {
    for (const s of ["", "2010-1-1", "2010-02-30", "2011-02-29", "1899-12-31", "2026-06-16", "abc"]) {
      expect(parseBirth(s)).toBeNull();
    }
    expect(parseBirth(undefined)).toBeNull();
  });
  it("מקבל תאריכים תקינים כולל 29 בפברואר בשנה מעוברת", () => {
    expect(parseBirth("2012-02-29")).not.toBeNull();
    expect(parseBirth("2026-06-15")).not.toBeNull();
  });
});

describe("ageOf / isAdult", () => {
  it("ביום ההולדת הגיל עולה, יום לפני עדיין לא", () => {
    expect(ageOf("2008-06-15")).toBe(18);
    expect(ageOf("2008-06-16")).toBe(17);
    expect(ageOf("2008-07-01")).toBe(17);
    expect(ageOf("2008-05-31")).toBe(18);
  });
  it("תינוק שנולד היום הוא בן 0, תאריך לא תקין הוא null", () => {
    expect(ageOf("2026-06-15")).toBe(0);
    expect(ageOf("nope")).toBeNull();
  });
  it("isAdult: רק מגיל 18, ותאריך לא תקין אינו בגיר", () => {
    expect(isAdult("2008-06-15")).toBe(true);
    expect(isAdult("2008-06-16")).toBe(false);
    expect(isAdult("")).toBe(false);
  });
});
