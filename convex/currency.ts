// מטבעות, מדינות והמרות. המשפחה בוחרת מדינת מגורים ומטבע ראשי.
// כל רשומה נשמרת במטבע שלה (amount = מאיות של המטבע, כמו אגורות).
// מטבע חסר (משפחה שעוד לא זוהתה לה מדינה, רשומה בלי currency) = דולר, ברירת המחדל הבינלאומית.
// הנתונים הישנים שהיו בשקלים בלי currency קיבלו ILS במפורש (maintenance.fillLegacyCurrency).
export const DEFAULT_CURRENCY = "USD";
// התקרה לסכום רשומה נמדדת בשקלים (10,000 ש"ח או השווי שלהם).
export const LIMIT_CURRENCY = "ILS";

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

export const curOf = (e: { currency?: string }) => e.currency ?? DEFAULT_CURRENCY;

// המרה לפי טבלת שערים (יחידות לדולר). null אם חסר שער.
export function convert(amount: number, from: string, to: string, rates: Rates | null | undefined): number | null {
  if (from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return null;
  return (amount * rates[to]) / rates[from];
}

const SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

// סכום להתראות: ₪12.50, $100, 30 CHF.
export function fmtMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const s = (amount / 100).toFixed(2);
  const n = s.endsWith(".00") ? s.slice(0, -3) : s;
  const sym = SYMBOLS[currency];
  return sym ? sym + n : `${n} ${currency}`;
}

export type RateAt = "loan" | "payment";
type DebtFx = { currency?: string; fx?: Rates; rateAt?: RateAt };

// השערים שלפיהם החזר יורד מחוב. חוב שנקבע לו "לפי השער ביום ההלוואה" (rateAt = loan) מומר תמיד
// לפי השערים שנשמרו בו; אחרת לפי השערים שנשמרו בהחזר (יום התשלום), ואם אין - השערים הנוכחיים.
export function ratesFor(debt: DebtFx, pay: { currency?: string; fx?: Rates }, rates: Rates | null | undefined): Rates | null | undefined {
  if (debt.rateAt === "loan" && debt.fx && debt.fx[curOf(debt)] && debt.fx[curOf(pay)]) return debt.fx;
  return pay.fx ?? rates;
}

// השערים שנשמרים בחוב במטבע זר: רק המטבעות הרלוונטיים (מטבע החוב, המטבעות שבהם ישלמו אותו, ודולר).
export function debtFx(rates: Rates | null, currencies: string[]): Rates | undefined {
  if (!rates) return undefined;
  const out: Rates = {};
  for (const c of new Set([...currencies, "USD"])) if (rates[c]) out[c] = rates[c];
  return currencies.every((c) => out[c]) ? out : undefined;
}

// כמה מחוב מסוים כבר הוחזר (במטבע החוב), לפי ההחזרים שקושרו אליו ושערי ההמרה שנשמרו בהם.
export function paidOnDebt(debt: { _id: unknown } & DebtFx, all: { kind: string; debtId?: unknown; amount: number; currency?: string; fx?: Rates }[], rates: Rates | null): number {
  let paid = 0;
  for (const x of all) {
    if (x.kind !== "payment" || x.debtId !== debt._id) continue;
    const c = convert(x.amount, curOf(x), curOf(debt), ratesFor(debt, x, rates));
    if (c !== null) paid += c;
  }
  return paid;
}
