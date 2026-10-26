export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// חתימת ECDSA מגיעה בקידוד DER, ו-WebCrypto מצפה ל-r||s גולמי (64 בתים ל-P-256).
export function derToRaw(der: Uint8Array): Uint8Array {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad der");
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i++;
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("bad der");
    const len = der[i++];
    let n = der.slice(i, i + len);
    i += len;
    while (n.length > 32 && n[0] === 0) n = n.slice(1);
    if (n.length > 32) throw new Error("bad der");
    const out = new Uint8Array(32);
    out.set(n, 32 - n.length);
    return out;
  };
  return concat(readInt(), readInt());
}
