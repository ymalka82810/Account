import { useState } from 'react';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useSheet } from '../shared/Sheet.jsx';
import LocalePicker from '../shared/LocalePicker.jsx';

// למשפחה שעוד לא הגדירה איפה היא גרה (נפתח פעם אחת להורה). קובע את מדינת המגורים ואת המטבע של המשפחה.
export default function LocaleSheet({ token }) {
  const sheet = useSheet();
  const [locale, setLocale] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await call('family:setLocale', { token, country: locale.country || undefined, currency: locale.currency }); toast('המיקום והמטבע נשמרו ✅'); sheet.close(); }
    catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="form">
      <p className="hint">לפי המדינה נקבע המטבע של המשפחה. אפשר לשנות אחר כך בלשונית ניהול.</p>
      <LocalePicker value={locale} onChange={setLocale} />
      {locale && <button className="primary" type="button" disabled={busy} onClick={save}>{busy ? '⏳ רגע…' : 'שמירה'}</button>}
    </div>
  );
}
