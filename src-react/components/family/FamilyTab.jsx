import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { openDebts, namesFor } from '../../lib/computations.js';
import PendingCards from '../entries/PendingCards.jsx';
import Balances from './Balances.jsx';
import OpenDebts from './OpenDebts.jsx';
import TeenOverview from './TeenOverview.jsx';

// לשונית המשפחה (הורים): אישורים, יתרות, חובות פתוחים ומה שהנוער רושם. הגדרות וניהול נמצאים בלשונית "ניהול".
export default function FamilyTab({ data, fdata, token }) {
  const { me } = useApp();
  const { owesLine } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const debts = openDebts(data.people, data.entries);
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];

  return (
    <>
      <PendingCards data={data} token={token} parentView />

      <h2>{t('יתרות')}</h2>
      <Balances people={data.people} debts={debts} />

      <h2>{t('כל החובות הפתוחים')}</h2>
      <OpenDebts debts={debts} owesLine={owesLine} />

      <TeenOverview teens={teens} />
    </>
  );
}
