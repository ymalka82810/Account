import { useState } from 'react';
import Select from './Select.jsx';
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
        <button type="button" className="ghost small" onClick={() => { onChange(null); setMode('list'); }}>שינוי</button>
      </div>
    );
  }

  if (mode === 'ask') {
    const name = countryName(detected);
    return (
      <div className="locale-ask">
        <p>נראה שהמכשיר נמצא ב{name}. האם אתם גרים ב{name}?</p>
        {!inList(detected) && <p className="hint">{name} לא ברשימת המדינות, אז המטבע יהיה דולר.</p>}
        <div className="locale-ask-btns">
          <button type="button" className="primary" onClick={() => choose(detected)}>כן</button>
          <button type="button" className="ghost" onClick={() => { onChange(null); setMode('list'); }}>לא</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Select value={pick} placeholder="בחירת מדינה"
        onChange={(c) => { setPick(c); choose(c === OTHER ? '' : c); }}
        options={[
          ...COUNTRIES.map(([code, name, cur]) => ({ value: code, label: `${name} (${currencySymbol(cur)})` })),
          { value: OTHER, label: 'המדינה שלי לא ברשימה ($)' },
        ]} />
      {value && <p className="hint">המטבע: {currencyLabel(value.currency)}</p>}
    </>
  );
}
