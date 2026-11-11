// מנהל (זמני): פס מעבר בין תצוגת הורה, נער/ה וילד/ה, בלחיצה או בהחלקה על הפס, בכל משפחה שבה הוא נמצא.
// התפקיד האמיתי שלו במשפחה לא משתנה: השרת מחליף את התפקיד רק בסשן הזה (superAdmin:viewAs).
// כלי פנימי, ולכן בעברית בלבד ובלי תרגום.
import { useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';

const ROLES = [['parent', 'הורה'], ['teen', 'נער/ה'], ['child', 'ילד/ה']];

export default function AdminRoleBar() {
  const { data, token } = useApp();
  const [busy, setBusy] = useState(false);
  const startX = useRef(null);
  const current = data.me.role;
  const idx = ROLES.findIndex(([r]) => r === current);

  async function go(role) {
    if (busy || role === current) return;
    setBusy(true);
    try { await call('superAdmin:viewAs', { token, role: role === data.me.realRole ? null : role }); }
    catch (e) { toast(errMsg(e)); }
    finally { setBusy(false); }
  }

  // בעברית הפס מימין לשמאל: החלקה שמאלה = התפקיד הבא, ימינה = הקודם.
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 40) return;
    const rtl = document.documentElement.dir !== 'ltr';
    const step = (dx < 0) === rtl ? 1 : -1;
    const next = ROLES[idx + step];
    if (next) go(next[0]);
  };

  return (
    <div className="admin-roles" role="tablist" aria-label="תצוגת מנהל" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-busy={busy}>
      <span className="admin-roles-tag">🛠️</span>
      {ROLES.map(([r, label]) => (
        <button key={r} type="button" role="tab" aria-selected={r === current} className={r === current ? 'on' : ''} onClick={() => go(r)}>
          {label}{r === data.me.realRole ? ' ★' : ''}
        </button>
      ))}
    </div>
  );
}
