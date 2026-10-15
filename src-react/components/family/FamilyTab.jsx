import { useApp } from '../../state/appContext.js';
import { openDebts, namesFor } from '../../lib/computations.js';
import PendingCards from '../entries/PendingCards.jsx';
import Balances from './Balances.jsx';
import OpenDebts from './OpenDebts.jsx';
import TeenOverview from './TeenOverview.jsx';

// לשונית המשפחה (הורים): אישורים, יתרות, חובות פתוחים ומה שהנוער רושם. הגדרות וניהול נמצאים בלשונית "ניהול".
export default function FamilyTab({ data, fdata, token }) {
  const { me } = useApp();
  const { nameOf, gw } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const debts = openDebts(data.people, data.entries);
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];

  return (
    <>
      <PendingCards data={data} token={token} parentView />

      <h2>יתרות</h2>
      <Balances people={data.people} debts={debts} />

      <h2>כל החובות הפתוחים</h2>
      <OpenDebts debts={debts} nameOf={nameOf} gw={gw} />

      <TeenOverview teens={teens} />
    </>
  );
}
