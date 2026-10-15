// מטבעות ומדינות לבחירה (אותה רשימה כמו convex/currency.ts).
export const CURRENCY_NAMES = {
  ILS: 'שקל חדש', USD: 'דולר אמריקאי', EUR: 'אירו', GBP: 'לירה שטרלינג', CAD: 'דולר קנדי',
  AUD: 'דולר אוסטרלי', NZD: 'דולר ניו זילנדי', CHF: 'פרנק שוויצרי', JPY: 'ין יפני', CNY: 'יואן סיני',
  HKD: 'דולר הונג קונגי', SGD: 'דולר סינגפורי', INR: 'רופי הודי', THB: 'באט תאילנדי', AED: 'דירהם',
  TRY: 'לירה טורקית', RUB: 'רובל', UAH: 'הריבנה', PLN: 'זלוטי', CZK: 'כתר צ׳כי', HUF: 'פורינט',
  SEK: 'כתר שוודי', NOK: 'כתר נורווגי', DKK: 'כתר דני', ZAR: 'ראנד', BRL: 'ריאל ברזילאי',
  ARS: 'פסו ארגנטינאי', MXN: 'פסו מקסיקני',
};
export const CURRENCIES = Object.keys(CURRENCY_NAMES);

// [קוד מדינה, שם, מטבע]
export const COUNTRIES = [
  ['IL', 'ישראל', 'ILS'], ['US', 'ארצות הברית', 'USD'], ['CA', 'קנדה', 'CAD'], ['GB', 'בריטניה', 'GBP'],
  ['FR', 'צרפת', 'EUR'], ['BE', 'בלגיה', 'EUR'], ['DE', 'גרמניה', 'EUR'], ['NL', 'הולנד', 'EUR'],
  ['IT', 'איטליה', 'EUR'], ['ES', 'ספרד', 'EUR'], ['PT', 'פורטוגל', 'EUR'], ['AT', 'אוסטריה', 'EUR'],
  ['IE', 'אירלנד', 'EUR'], ['GR', 'יוון', 'EUR'], ['CH', 'שווייץ', 'CHF'], ['AU', 'אוסטרליה', 'AUD'],
  ['NZ', 'ניו זילנד', 'NZD'], ['ZA', 'דרום אפריקה', 'ZAR'], ['AR', 'ארגנטינה', 'ARS'], ['BR', 'ברזיל', 'BRL'],
  ['MX', 'מקסיקו', 'MXN'], ['RU', 'רוסיה', 'RUB'], ['UA', 'אוקראינה', 'UAH'], ['SE', 'שוודיה', 'SEK'],
  ['NO', 'נורווגיה', 'NOK'], ['DK', 'דנמרק', 'DKK'], ['PL', 'פולין', 'PLN'], ['HU', 'הונגריה', 'HUF'],
  ['CZ', 'צ׳כיה', 'CZK'], ['TR', 'טורקיה', 'TRY'], ['AE', 'איחוד האמירויות', 'AED'], ['IN', 'הודו', 'INR'],
  ['CN', 'סין', 'CNY'], ['JP', 'יפן', 'JPY'], ['TH', 'תאילנד', 'THB'], ['SG', 'סינגפור', 'SGD'],
  ['HK', 'הונג קונג', 'HKD'],
];

// הסמל של המטבע ($, ₪, €), או הקוד אם אין סמל קצר.
export function currencySymbol(cur) {
  try {
    const p = new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((x) => x.type === 'currency');
    return p ? p.value : cur;
  } catch { return cur; }
}

export const currencyLabel = (cur) => `${currencySymbol(cur)} ${CURRENCY_NAMES[cur] || cur}`;

// מדינה שאינה ברשימה: אין מדינה, והמטבע דולר.
export const DEFAULT_CURRENCY = 'USD';
export function localeFor(code) {
  const hit = COUNTRIES.find((c) => c[0] === code);
  return hit ? { country: hit[0], currency: hit[2] } : { country: undefined, currency: DEFAULT_CURRENCY };
}
export const inList = (code) => COUNTRIES.some((c) => c[0] === code);

// שם מדינה בעברית (גם למדינות שלא ברשימה)
export function countryName(code) {
  const hit = COUNTRIES.find((c) => c[0] === code);
  if (hit) return hit[1];
  try { return new Intl.DisplayNames(['he'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

// אזורי זמן של המדינות ברשימה
const TZ_COUNTRY = {
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL',
  'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Vienna': 'AT',
  'Europe/Athens': 'GR', 'Europe/Zurich': 'CH', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL',
  'Europe/Budapest': 'HU', 'Europe/Prague': 'CZ', 'Europe/Istanbul': 'TR', 'Asia/Dubai': 'AE',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK', 'Africa/Johannesburg': 'ZA', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Mexico_City': 'MX',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'Pacific/Auckland': 'NZ',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
};

// המדינה שבה המכשיר נמצא עכשיו (קוד ISO, גם אם אינה ברשימה), או null.
// אזור הזמן משקף את המיקום בפועל; אם הוא לא ברשימה שלנו - לפי האזור בהגדרות השפה.
export function deviceCountry() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* */ }
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  if (tz.startsWith('Australia/')) return 'AU';
  for (const lang of navigator.languages || [navigator.language]) {
    const region = (lang || '').split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  }
  return null;
}
