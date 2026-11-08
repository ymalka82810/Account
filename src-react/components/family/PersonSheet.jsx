import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheetTitle } from '../shared/Sheet.jsx';
import { money, namesFor, openDebts } from '../../lib/computations.js';
import OpenDebts from './OpenDebts.jsx';
import Goals from '../goals/Goals.jsx';
import Achievements from '../goals/Achievements.jsx';
import { balanceOf, balanceWhat } from './balance.js';

// הדף האישי של בן משפחה (להורה): יתרה, החובות שלו, יעדי החיסכון וההישגים. נפתח בחלון תחתון מרשימת בני המשפחה.
// הנתונים נלקחים מההקשר החי, כך שהחלון מתעדכן גם אחרי הפקדה או מחיקה.
export default function PersonSheet({ personId }) {
  const { data, token, me } = useApp();
  const p = data.people.find((x) => x.id === personId);
  useSheetTitle(p ? `${p.avatar ? p.avatar + ' ' : ''}${p.name}` : '');
  if (!p) return null;
  const debts = openDebts(data.people, data.entries).filter((d) => d.debtor === p.id || d.creditor === p.id);
  const { owesLine } = namesFor(me, (id) => data.people.find((x) => x.id === id));
  const v = balanceOf(p.id, debts);
  const isKid = p.role !== 'parent';

  return (
    <>
      <div className={'person-bal ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero')}>
        <div className="num">{money(Math.abs(v))}</div>
        <div className="what">{balanceWhat(p, v)}</div>
      </div>
      <h2>{t('כל החובות הפתוחים')}</h2>
      <OpenDebts debts={debts} owesLine={owesLine} />
      {isKid && <Goals data={data} token={token} personId={p.id} />}
      {isKid && <Achievements title={t('הישגים: {name}', { name: p.name })} personId={p.id} entries={data.entries} goals={data.goals} />}
    </>
  );
}
