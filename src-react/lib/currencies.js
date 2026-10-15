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
