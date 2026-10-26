import { describe, expect, it } from "vitest";
import { hashPin, pinNeedsUpgrade, verifyPin } from "../convex/lib";

// הגיבוב הישן: SHA-256 בלולאה של 2000, כפי שנשמר בפריסה לפני המעבר ל-PBKDF2.
async function legacy(pin: string, salt: string) {
  const sha = async (t: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  let h = await sha(salt + ":" + pin);
  for (let i = 0; i < 2000; i++) h = await sha(hex(h) + salt);
  return hex(h);
}

describe("גיבוב קוד סודי", () => {
  it("מאמת קוד נכון ודוחה שגוי", async () => {
    const h = await hashPin("1234", "salt");
    expect(h.startsWith("v2:")).toBe(true);
    expect(await verifyPin("1234", "salt", h)).toBe(true);
    expect(await verifyPin("1235", "salt", h)).toBe(false);
  });

  it("מזהה גיבוב ישן, מאמת אותו וממליץ לשדרג", async () => {
    const old = await legacy("4321", "s");
    expect(await verifyPin("4321", "s", old)).toBe(true);
    expect(await verifyPin("0000", "s", old)).toBe(false);
    expect(pinNeedsUpgrade(old)).toBe(true);
    expect(pinNeedsUpgrade(await hashPin("4321", "s"))).toBe(false);
  });
});
