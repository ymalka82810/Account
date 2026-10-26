// מטבעות, מדינות והמרות. המשפחה בוחרת מדינת מגורים ומטבע ראשי.
// כל רשומה נשמרת במטבע שלה (amount = מאיות של המטבע, כמו אגורות).
// רשומה ישנה בלי currency היא בשקלים (כל הנתונים לפני הפיצ'ר היו בשקלים).

export const LEGACY_CURRENCY = "ILS";

export const CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "CNY", "HKD", "SGD", "INR", "THB",
  "AED", "TRY", "RUB", "UAH", "PLN", "CZK", "HUF", "SEK", "NOK", "DKK", "ZAR", "BRL", "ARS", "MXN",
] as const;

export const COUNTRIES: Record<string, string> = {
  IL: "ILS", US: "USD", CA: "CAD", GB: "GBP", FR: "EUR", DE: "EUR", BE: "EUR", NL: "EUR", IT: "EUR",
  ES: "EUR", AT: "EUR", IE: "EUR", GR: "EUR", PT: "EUR", CH: "CHF", AU: "AUD", NZ: "NZD", ZA: "ZAR",
  AR: "ARS", BR: "BRL", MX: "MXN", RU: "RUB", UA: "UAH", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  HU: "HUF", CZ: "CZK", TR: "TRY", AE: "AED", IN: "INR", CN: "CNY", JP: "JPY", TH: "THB", SG: "SGD",
  HK: "HKD",
};

export const isCurrency = (c: string) => (CURRENCIES as readonly string[]).includes(c);

export type Rates = Record<string, number>; // כמה יחידות מכל מטבע שווה דולר אחד

export const curOf = (e: { currency?: string }) => e.currency ?? LEGACY_CURRENCY;

// המרה לפי טבלת שערים (יחידות לדולר). null אם חסר שער.
export function convert(amount: number, from: string, to: string, rates: Rates | null | undefined): number | null {
  if (from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return null;
  return (amount * rates[to]) / rates[from];
}

const SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

// סכום להתראות: ₪12.50, $100, 30 CHF.
export function fmtMoney(amount: number, currency: string = LEGACY_CURRENCY): string {
  const s = (amount / 100).toFixed(2);
  const n = s.endsWith(".00") ? s.slice(0, -3) : s;
  const sym = SYMBOLS[currency];
  return sym ? sym + n : `${n} ${currency}`;
}

// כמה מחוב מסוים כבר הוחזר (במטבע החוב), לפי ההחזרים שקושרו אליו ושערי ההמרה שנשמרו בהם.
export function paidOnDebt(debt: { _id: unknown; currency?: string }, all: { kind: string; debtId?: unknown; amount: number; currency?: string; fx?: Rates }[], rates: Rates | null): number {
  let paid = 0;
  for (const x of all) {
    if (x.kind !== "payment" || x.debtId !== debt._id) continue;
    const c = convert(x.amount, curOf(x), curOf(debt), x.fx ?? rates);
    if (c !== null) paid += c;
  }
  return paid;
}
