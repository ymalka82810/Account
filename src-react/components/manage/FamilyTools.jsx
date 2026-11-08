import { t, intlLocale } from '../../i18n/index.js';
import { state, CODE_KEY } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession } from '../../state/auth.js';
import { useApp } from '../../state/appContext.js';
import { useState } from 'react';
import Reveal from '../shared/Reveal.jsx';
import { useSheet } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { Err } from '../shared/fields.jsx';
import FamilyNameField, { buildFamilyName, bareFamilyName } from '../shared/FamilyNameField.jsx';
import Select from '../shared/Select.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { BioError } from '../../lib/biometric.js';
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
      <Reveal show={changed}><button className="primary" type="button" disabled={busy} onClick={save}>{t('שמירה')}</button></Reveal>
      <Reveal show={others.length > 0}>
        <div className="fx-rates">
          {others.map((c) => {
            const r = convert(100, c, base, rates);
            return <div className="meta" key={c}>{currencySymbol(c)}1 = {r === null ? t('אין שער כרגע') : (r / 100).toLocaleString(intlLocale(), { style: 'currency', currency: base, maximumFractionDigits: 4 })}</div>;
          })}
          {fx && <div className="meta">{t('השערים עודכנו {when}', { when: new Date(fx.fetchedAt).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) })}</div>}
        </div>
      </Reveal>
    </div>
  );
}

// חלון שינוי שם המשפחה: "משפחת" קבוע, מקלידים רק את השם עצמו.
function RenameSheet({ current }) {
  const { token } = useApp();
  const sheet = useSheet();
  const [name, setName] = useState(bareFamilyName(current));
  const [err, setErr] = useState('');
  async function save() {
    if (!name.trim()) { setErr(t('איך לקרוא למשפחה?')); return; }
    try { await call('family:rename', { token, name: buildFamilyName(name) }); sheet.close(); toast(t('השם עודכן ✅')); }
    catch (e) { setErr(errMsg(e)); }
  }
  return (
    <form className="form" autoComplete="off" onSubmit={(ev) => ev.preventDefault()}>
      <label className="field"><span>{t('איך לקרוא למשפחה?')}</span>
        <FamilyNameField autoFocus required={false} value={name} onChange={(x) => { setName(x); setErr(''); }} /></label>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" type="submit" onClick={save}>{t('שמירה')}</AsyncButton>
    </form>
  );
}

// שינוי שם המשפחה (הורים).
export default function FamilySettings({ data }) {
  const sheet = useSheet();
  const rename = () => sheet.open(t('שינוי שם המשפחה'), <RenameSheet current={data.family.name} />);

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
  const confirm = useConfirm();
  const bioConfirm = useBioConfirm();
  async function deleteFamily() {
    const typed = await confirm({
      icon: '⚠️',
      title: t('מחיקת הקופה כולה'),
      message: t('זה ימחק את כל הקופה: כל האנשים וכל הרשומות, ואי אפשר לבטל.\nכדי לאשר, כתבו את שם המשפחה: {name}', { name: data.family.name }),
      input: {},
      okText: t('מחיקה'),
      cancelText: t('חזרה'),
      danger: true,
    });
    if (typed === null) return;
    try {
      const proof = await bioConfirm('family-remove', { why: t('מחיקת הקופה אי אפשר לבטל, ולכן היא מאושרת על ידי הורה. תיפתח עכשיו בקשת אימות מהמכשיר.'), need: t('למחוק את הקופה') });
      await call('family:remove', { token, confirmName: typed, proof });
      localStorage.removeItem(CODE_KEY);
      state.fam = null;
      toast(t('הקופה נמחקה'));
      dropSession();
    } catch (e) {
      if (!(e instanceof BioError && e.code === 'cancel')) toast(e instanceof BioError ? e.message : errMsg(e));
    }
  }

  return (
    <div className="tools">
      <button className="ghost danger-ghost" type="button" onClick={deleteFamily}>{t('מחיקת הקופה כולה')}</button>
    </div>
  );
}
