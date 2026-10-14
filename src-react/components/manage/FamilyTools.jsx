import { state, CODE_KEY } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { dropSession } from '../../state/auth.js';
import { useApp } from '../../state/appContext.js';

// שינוי שם המשפחה (הורים).
export default function FamilySettings({ data }) {
  const { token } = useApp();

  async function rename() {
    const name = prompt('איך לקרוא למשפחה?', data.family.name);
    if (name === null || !name.trim()) return;
    try { await call('family:rename', { token, name }); toast('השם עודכן ✅'); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="tools">
      <button className="ghost" type="button" onClick={rename}>שינוי שם המשפחה</button>
    </div>
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
