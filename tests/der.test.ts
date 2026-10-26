import { describe, expect, it } from "vitest";
import { derToRaw } from "../convex/der";

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
const der = (...ints: number[][]) => {
  const body = ints.flatMap((n) => [0x02, n.length, ...n]);
  return new Uint8Array([0x30, body.length, ...body]);
};
const fill = (len: number, v: number) => Array(len).fill(v);

describe("derToRaw", () => {
  it("r ו-s באורך 32 נשארים כמו שהם", () => {
    const raw = derToRaw(der(fill(32, 0x11), fill(32, 0x22)));
    expect(raw.length).toBe(64);
    expect(hex(raw)).toBe("11".repeat(32) + "22".repeat(32));
  });
  it("מוריד אפס מוביל (33 בתים) ומרפד ערך קצר משמאל", () => {
    const raw = derToRaw(der([0, 0x80, ...fill(31, 1)], [5, 6]));
    expect(raw.length).toBe(64);
    expect(raw[0]).toBe(0x80);
    expect(hex(raw.slice(32))).toBe("00".repeat(30) + "0506");
  });
  it("חתימה אמיתית של WebCrypto מאומתת אחרי ההמרה", async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const data = new TextEncoder().encode("account-bio:abc");
    const rawSig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data));
    const trim = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; const t = Array.from(b.slice(i)); return t[0] & 0x80 ? [0, ...t] : t; };
    const back = derToRaw(der(trim(rawSig.slice(0, 32)), trim(rawSig.slice(32))));
    expect(hex(back)).toBe(hex(rawSig));
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, back as BufferSource, data)).toBe(true);
    const tampered = new TextEncoder().encode("account-bio:abd");
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, back as BufferSource, tampered)).toBe(false);
  });
  it("קלט שבור נזרק", () => {
    expect(() => derToRaw(new Uint8Array([0x31, 0, 0]))).toThrow();
    expect(() => derToRaw(new Uint8Array([0x30, 4, 0x03, 1, 0, 0]))).toThrow();
    expect(() => derToRaw(der(fill(34, 1), [1]))).toThrow();
  });
});
