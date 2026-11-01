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
});
