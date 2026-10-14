import { state, CODE_KEY } from '../state/state.js';
import { call } from '../lib/api.js';
import { today, toast, errMsg } from '../lib/helpers.js';
import { dropSession } from '../state/auth.js';
import { useApp } from '../appContext.js';
import { cleanPayload } from '../lib/legacy.js';

// גיבוי, שחזור מקובץ ושינוי שם (הורים).
export default function FamilySettings({ data }) {
  const { token } = useApp();
  function exportBackup() {
    const out = {
      people: data.people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
      entries: data.entries.map((e) => ({ kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note, date: e.date })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kupa-backup-${today()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importBackup(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.people) || !Array.isArray(s.entries)) throw new Error('bad');
      if (!confirm(`להוסיף ${s.entries.length} רשומות מהקובץ? שום דבר קיים לא יימחק.`)) return;
      const res = await call('admin:importData', { token, ...cleanPayload(s) });
      toast(`נוספו ${res.added} רשומות`);
    } catch (e) {
      toast(e && e.data ? errMsg(e) : 'הקובץ לא נראה כמו גיבוי של הקופה');
    }
  }

  async function rename() {
    const name = prompt('איך לקרוא למשפחה?', data.family.name);
    if (name === null || !name.trim()) return;
    try { await call('family:rename', { token, name }); toast('השם עודכן ✅'); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <>
      <div className="tools">
        <button className="ghost" type="button" onClick={exportBackup}>שמירת גיבוי</button>
        <label className="ghost filebtn">הוספה מקובץ גיבוי<input type="file" accept="application/json" hidden onChange={importBackup} /></label>
      </div>
      <div className="tools">
        <button className="ghost" type="button" onClick={rename}>שינוי שם המשפחה</button>
      </div>
    </>
  );
}

// מחיקת הקופה כולה, מופרדת משאר ההגדרות.
export function DangerZone({ data, token }) {
  async function deleteFamily() {
    const typed = prompt(`זה ימחק את כל הקופה: כל האנשים וכל הרשומות, ואי אפשר לבטל.\nכדי לאשר, כתבו את שם המשפחה: ${data.family.name}`);
    if (typed === null) return;
    try {
      await call('family:remove', { token, confirmName: typed });
      localStorage.removeItem(CODE_KEY);
      state.fam = null;
      toast('הקופה נמחקה');
      dropSession();
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="tools">
      <button className="ghost danger-ghost" type="button" onClick={deleteFamily}>מחיקת הקופה כולה</button>
    </div>
  );
}
