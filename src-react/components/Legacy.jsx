import { call } from '../../src/api.js';
import { useState } from 'react';
import { toast, errMsg } from '../../src/helpers.js';
import { LEGACY_DONE_KEY } from '../../src/state.js';
import { readLegacy, cleanPayload } from '../../src/screens/legacy.js';

// גרסת React של renderLegacy(): הצעה להעביר נתונים ישנים מהמכשיר לשרת.
export default function Legacy({ token }) {
  const [, bump] = useState(0);
  const s = readLegacy();
  if (!s) return null;

  async function migrate() {
    try {
      const res = await call('admin:importData', { token, ...cleanPayload(s) });
      localStorage.setItem(LEGACY_DONE_KEY, '1');
      toast(`הועברו ${res.added} רשומות`);
      bump((n) => n + 1);
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="card notice">
      <p>נמצאו במכשיר הזה נתונים מהגרסה הקודמת: {s.people.length} אנשים ו-{s.entries.length} רשומות. להעביר אותם לשרת?</p>
      <p className="hint">האנשים שיתווספו יבחרו קוד סודי בכניסה הראשונה שלהם.</p>
      <button className="primary" type="button" onClick={migrate}>העברה לשרת</button>
    </div>
  );
}
