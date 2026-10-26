import { t, intlLocale } from '../../i18n/index.js';
import { state, CODE_KEY } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession } from '../../state/auth.js';
import { useApp } from '../../state/appContext.js';
import { useState } from 'react';
import Select from '../shared/Select.jsx';
import { COUNTRIES, CURRENCIES, currencyLabel, currencySymbol, countryName } from '../../lib/currencies.js';
import { convert, curOf } from '../../lib/computations.js';

// מיקום המגורים והמטבע הראשי של המשפחה (הורים). בחירת מדינה קובעת גם את המטבע שלה,
// ואפשר לשנות את המטבע בנפרד. חובות במטבע אחר נשארים במטבע שלהם ומומרים לפי השער של היום.
function LocaleSettings({ data }) {
  const { token, fx } = useApp();
  const [country, setCountry] = useState(data.family.country || '');
  const [currency, setCurrency] = useState(data.family.currency || 'ILS');
  const [busy, setBusy] = useState(false);
  const changed = country !== (data.family.country || '') || currency !== (data.family.currency || 'ILS');

  function pickCountry(c) {
    setCountry(c);
    const hit = COUNTRIES.find((x) => x[0] === c);
    if (hit) setCurrency(hit[1]);
  }
  async function save() {
    setBusy(true);
    try { await call('family:setLocale', { token, country: country || undefined, currency }); toast(t('המיקום והמטבע עודכנו ✅')); }
    catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  }

  // מטבעות אחרים שיש בהם רשומות: מציגים את השער שלהם מול המטבע הראשי.
  const base = data.family.currency || 'ILS';
  const others = [...new Set(data.entries.map(curOf))].filter((c) => c !== base);
  const rates = fx && fx.rates;

  return (
    <div className="form card">
      <h3>{t('מיקום ומטבע')}</h3>
      <div className="field"><span>{t('מדינת המגורים')}</span>
        <Select value={country} onChange={pickCountry} placeholder={t('בחירת מדינה')}
          options={COUNTRIES.map(([code, cur]) => ({ value: code, label: `${countryName(code)} (${currencySymbol(cur)})` }))} /></div>
      <div className="field"><span>{t('המטבע של המשפחה')}</span>
        <Select value={currency} onChange={setCurrency}
          options={CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c) }))} /></div>
      <p className="hint">{t('כל הסכומים מוצגים במטבע הזה. אפשר לרשום חוב במטבע אחר (למשל 100 דולר), וכשמשלמים אותו הוא מומר לפי השער של אותו יום.')}</p>
      {changed && <button className="primary" type="button" disabled={busy} onClick={save}>{t('שמירה')}</button>}
      {others.length > 0 && (
        <div className="fx-rates">
          {others.map((c) => {
            const r = convert(100, c, base, rates);
            return <div className="meta" key={c}>{currencySymbol(c)}1 = {r === null ? t('אין שער כרגע') : (r / 100).toLocaleString(intlLocale(), { style: 'currency', currency: base, maximumFractionDigits: 4 })}</div>;
          })}
          {fx && <div className="meta">{t('השערים עודכנו {when}', { when: new Date(fx.fetchedAt).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) })}</div>}
        </div>
      )}
    </div>
  );
}

// שינוי שם המשפחה (הורים).
export default function FamilySettings({ data }) {
  const { token } = useApp();

  async function rename() {
    const name = prompt(t('איך לקרוא למשפחה?'), data.family.name);
    if (name === null || !name.trim()) return;
    try { await call('family:rename', { token, name }); toast(t('השם עודכן ✅')); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <>
      <LocaleSettings data={data} />
      <div className="tools">
        <button className="ghost" type="button" onClick={rename}>{t('שינוי שם המשפחה')}</button>
      </div>
    </>
  );
}

// מחיקת הקופה כולה, מופרדת משאר ההגדרות.
export function DangerZone({ data, token }) {
  async function deleteFamily() {
    const typed = prompt(t('זה ימחק את כל הקופה: כל האנשים וכל הרשומות, ואי אפשר לבטל.\nכדי לאשר, כתבו את שם המשפחה: {name}', { name: data.family.name }));
    if (typed === null) return;
    try {
      await call('family:remove', { token, confirmName: typed });
      localStorage.removeItem(CODE_KEY);
      state.fam = null;
      toast(t('הקופה נמחקה'));
      dropSession();
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="tools">
      <button className="ghost danger-ghost" type="button" onClick={deleteFamily}>{t('מחיקת הקופה כולה')}</button>
    </div>
  );
}
