import { call } from '../../lib/api.js';
import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { LEGACY_DONE_KEY } from '../../state/state.js';
import { readLegacy, cleanPayload } from '../../lib/legacy.js';

// גרסת React של renderLegacy(): הצעה להעביר נתונים ישנים מהמכשיר לשרת.
export default function Legacy({ token }) {
  const [, bump] = useState(0);
  const s = readLegacy();
  if (!s) return null;

  async function migrate() {
    try {
      const res = await call('admin:importData', { token, ...cleanPayload(s) });
      localStorage.setItem(LEGACY_DONE_KEY, '1');
      toast(t('הועברו {n} רשומות', { n: res.added }));
      bump((n) => n + 1);
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="card notice">
      <p>{t('נמצאו במכשיר הזה נתונים מהגרסה הקודמת: {people} אנשים ו-{entries} רשומות. להעביר אותם לשרת?', { people: s.people.length, entries: s.entries.length })}</p>
      <p className="hint">{t('האנשים שיתווספו יבחרו קוד סודי בכניסה הראשונה שלהם.')}</p>
      <button className="primary" type="button" onClick={migrate}>{t('העברה לשרת')}</button>
    </div>
  );
}
