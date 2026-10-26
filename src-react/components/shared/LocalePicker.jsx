import { useState } from 'react';
import Select from './Select.jsx';
import { t } from '../../i18n/index.js';
import { COUNTRIES, currencyLabel, currencySymbol, countryName, deviceCountry, inList, localeFor } from '../../lib/currencies.js';

const OTHER = 'OTHER';

// איפה המשפחה גרה, וממנו המטבע של ברירת המחדל.
// המכשיר מזהה איפה הוא נמצא ושואל "אתם גרים ב...?". כן - המדינה הזו ומטבע שלה (מדינה שלא ברשימה - דולר).
// לא (למשל הותקן בחו"ל) או שהמיקום לא זוהה - בוחרים מהרשימה, ומי שהמדינה שלו לא בה מקבל דולר.
// onChange מקבל {country, currency}; country ריק = לא ברשימה.
export default function LocalePicker({ value, onChange }) {
  const [detected] = useState(() => deviceCountry());
  const [mode, setMode] = useState(detected ? 'ask' : 'list');
  const [pick, setPick] = useState('');

  const choose = (code) => onChange(localeFor(code));

  if (value && mode !== 'list') {
    const name = value.country ? countryName(value.country) : countryName(detected);
    return (
      <div className="locale-picked">
        <div>📍 {name} · {currencyLabel(value.currency)}</div>
        <button type="button" className="ghost small" onClick={() => { onChange(null); setMode('list'); }}>{t('שינוי')}</button>
      </div>
    );
  }

  if (mode === 'ask') {
    const name = countryName(detected);
    return (
      <div className="locale-ask">
        <p>{t('נראה שהמכשיר נמצא ב{name}. האם אתם גרים ב{name}?', { name })}</p>
        {!inList(detected) && <p className="hint">{t('{name} לא ברשימת המדינות, אז המטבע יהיה דולר.', { name })}</p>}
        <div className="locale-ask-btns">
          <button type="button" className="primary" onClick={() => choose(detected)}>{t('כן')}</button>
          <button type="button" className="ghost" onClick={() => { onChange(null); setMode('list'); }}>{t('לא')}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Select value={pick} placeholder={t('בחירת מדינה')}
        onChange={(c) => { setPick(c); choose(c === OTHER ? '' : c); }}
        options={[
          ...COUNTRIES.map(([code, cur]) => ({ value: code, label: `${countryName(code)} (${currencySymbol(cur)})` })),
          { value: OTHER, label: t('המדינה שלי לא ברשימה ($)') },
        ]} />
      {value && <p className="hint">{t('המטבע: {cur}', { cur: currencyLabel(value.currency) })}</p>}
    </>
  );
}
