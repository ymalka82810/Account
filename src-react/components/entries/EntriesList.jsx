import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { isPending, debtStates, canDelete, namesFor, money, moneyWithValue, curOf, fmtDate } from '../../lib/computations.js';

// רשימת רשומות. lookup(id) מחזיר אדם לפי מזהה.
export default function EntriesList({
  list, emptyText, token, me, isParent, lookup, debtList, removeEndpoint, pendingLabel, display,
}) {
  if (!list.length) return <div className="empty">{emptyText}</div>;
  const { subjectWord, toWord, gw, vw } = namesFor(me, lookup);
  const debtMap = debtStates(debtList);
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  async function remove(e) {
    if (!confirm(isParent ? 'למחוק את הרשומה הזאת?' : 'לבטל את מה שרשמת?')) return;
    try { await call(/** @type {'entries:remove' | 'friends:removeEntry'} */ (removeEndpoint || 'entries:remove'), { token, id: e.id }); toast('הרשומה נמחקה'); }
    catch (err) { toast(errMsg(err)); }
  }

  return sorted.map((e) => {
    const isDebt = e.kind === 'debt';
    // חוב: כמה נשאר ממנו. החזר: על איזה חוב הוא.
    let extra = '';
    const st = debtMap.get(e.id);
    if (isDebt && !isPending(e) && st && st.paid > 0) {
      extra = st.remaining > 0 ? `נשאר ${money(Math.round(st.remaining), st.cur)} מתוך ${money(e.amount, st.cur)}` : 'שולם במלואו ✅';
    } else if (isDebt && e.archived) {
      extra = 'שולם במלואו ✅'; // חוב שנסגר לא נשלח עם הנתונים הראשיים, אז אין לו מצב ב-debtMap
    } else if (!isDebt && e.debtId && (debtMap.get(e.debtId) || e.debtNote != null)) {
      extra = 'על: ' + ((debtMap.get(e.debtId)?.debt.note ?? e.debtNote) || 'חוב');
    }
    return (
      <div className={'row' + (isPending(e) ? ' pending' : '')} key={e.id}>
        <div className="text">
          <div>
            <span className={'tag tag-' + e.kind}>{isDebt ? 'חוב' : 'החזר'}</span>
            {isPending(e) && <span className="tag pending">{pendingLabel ? pendingLabel(e) : '⏳ ממתין לאישור'}</span>}
            {' '}{subjectWord(e.from)} {isDebt ? gw(e.from, 'חייב', 'חייבת', 'חייב/ת') : vw(e.from, 'החזרתי', 'החזיר', 'החזירה', 'החזיר/ה')} {toWord(e.to)}
          </div>
          <div className="meta">{[fmtDate(e.date), e.note, extra].filter(Boolean).join(' • ')}</div>
        </div>
        <strong>{isDebt && !isPending(e) && !e.archived && !(st && st.remaining <= 0) ? moneyWithValue(e.amount, curOf(e), display || undefined) : money(e.amount, curOf(e))}</strong>
        {canDelete(e, me, isParent) && (
          <button className="small danger" type="button" onClick={() => remove(e)}>{isParent ? 'מחיקה' : 'ביטול'}</button>
        )}
      </div>
    );
  });
}
