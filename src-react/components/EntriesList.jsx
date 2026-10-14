import { useConvex } from 'convex/react';
import { toast, errMsg } from '../../src/helpers.js';
import { isPending, debtStates, canDelete, namesFor, money, fmtDate } from '../lib/computations.js';

// גרסת React של src/entriesList.js (renderEntries). lookup(id) מחזיר אדם לפי מזהה.
export default function EntriesList({
  list, emptyText, token, me, isParent, lookup, debtList, removeEndpoint, pendingLabel,
}) {
  const convex = useConvex();
  if (!list.length) return <div className="empty">{emptyText}</div>;
  const { subjectWord, toWord } = namesFor(me, lookup);
  const debtMap = debtStates(debtList);
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  async function remove(e) {
    if (!confirm(isParent ? 'למחוק את הרשומה הזאת?' : 'לבטל את מה שרשמת?')) return;
    try { await convex.mutation(removeEndpoint || 'entries:remove', { token, id: e.id }); toast('הרשומה נמחקה'); }
    catch (err) { toast(errMsg(err)); }
  }

  return sorted.map((e) => {
    const isDebt = e.kind === 'debt';
    // חוב: כמה נשאר ממנו. החזר: על איזה חוב הוא.
    let extra = '';
    const st = debtMap.get(e.id);
    if (isDebt && !isPending(e) && st && st.paid > 0) {
      extra = st.remaining > 0 ? `נשאר ${money(st.remaining)} מתוך ${money(e.amount)}` : 'שולם במלואו ✅';
    } else if (!isDebt && e.debtId && debtMap.get(e.debtId)) {
      extra = 'על: ' + (debtMap.get(e.debtId).debt.note || 'חוב');
    }
    return (
      <div className={'row' + (isPending(e) ? ' pending' : '')} key={e.id}>
        <div className="text">
          <div>
            <span className={'tag ' + e.kind}>{isDebt ? 'חוב' : 'החזר'}</span>
            {isPending(e) && <span className="tag pending">{pendingLabel ? pendingLabel(e) : '⏳ ממתין לאישור'}</span>}
            {' '}{subjectWord(e.from)} {isDebt ? 'חייב/ת' : 'החזיר/ה'} {toWord(e.to)}
          </div>
          <div className="meta">{[fmtDate(e.date), e.note, extra].filter(Boolean).join(' • ')}</div>
        </div>
        <strong>{money(e.amount)}</strong>
        {canDelete(e, me, isParent) && (
          <button className="small danger" type="button" onClick={() => remove(e)}>{isParent ? 'מחיקה' : 'ביטול'}</button>
        )}
      </div>
    );
  });
}
