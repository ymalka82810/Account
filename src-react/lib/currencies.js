import { currentLang, intlLocale } from '../i18n/index.js';

// מטבעות ומדינות לבחירה (אותה רשימה כמו convex/currency.ts). השמות של מטבעות ומדינות
// באים מ-Intl.DisplayNames בשפת הממשק, כך שאין צורך לתרגם אותם בנפרד לכל שפה.
export const CURRENCIES = [
  'ILS', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'INR', 'THB', 'AED',
  'TRY', 'RUB', 'UAH', 'PLN', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'ZAR', 'BRL', 'ARS', 'MXN',
];

// [קוד מדינה, מטבע]
export const COUNTRIES = [
  ['IL', 'ILS'], ['US', 'USD'], ['CA', 'CAD'], ['GB', 'GBP'],
  ['FR', 'EUR'], ['BE', 'EUR'], ['DE', 'EUR'], ['NL', 'EUR'],
  ['IT', 'EUR'], ['ES', 'EUR'], ['PT', 'EUR'], ['AT', 'EUR'],
  ['IE', 'EUR'], ['GR', 'EUR'], ['CH', 'CHF'], ['AU', 'AUD'],
  ['NZ', 'NZD'], ['ZA', 'ZAR'], ['AR', 'ARS'], ['BR', 'BRL'],
  ['MX', 'MXN'], ['RU', 'RUB'], ['UA', 'UAH'], ['SE', 'SEK'],
  ['NO', 'NOK'], ['DK', 'DKK'], ['PL', 'PLN'], ['HU', 'HUF'],
  ['CZ', 'CZK'], ['TR', 'TRY'], ['AE', 'AED'], ['IN', 'INR'],
  ['CN', 'CNY'], ['JP', 'JPY'], ['TH', 'THB'], ['SG', 'SGD'],
  ['HK', 'HKD'],
];

// הסמל של המטבע ($, ₪, €), או הקוד אם אין סמל קצר.
export function currencySymbol(cur) {
  try {
    const p = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((x) => x.type === 'currency');
    return p ? p.value : cur;
  } catch { return cur; }
}

// שם המטבע בשפת הממשק ("שקל חדש", "US Dollar"); בלי תמיכה בדפדפן - הקוד.
export function currencyName(cur) {
  try { return new Intl.DisplayNames([currentLang()], { type: 'currency' }).of(cur) || cur; } catch { return cur; }
}

export const currencyLabel = (cur) => `${currencySymbol(cur)} ${currencyName(cur)}`;

// מדינה שאינה ברשימה: אין מדינה, והמטבע דולר.
export const DEFAULT_CURRENCY = 'USD';
export function localeFor(code) {
  const hit = COUNTRIES.find((c) => c[0] === code);
  return hit ? { country: hit[0], currency: hit[1] } : { country: undefined, currency: DEFAULT_CURRENCY };
}
export const inList = (code) => COUNTRIES.some((c) => c[0] === code);

// שם מדינה בשפת הממשק (גם למדינות שלא ברשימה)
export function countryName(code) {
  try { return new Intl.DisplayNames([currentLang()], { type: 'region' }).of(code) || code; } catch (e) { return code; }
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
