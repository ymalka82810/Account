import { useApp } from '../appContext.js';
import { openDebts, namesFor } from '../lib/computations.js';
import PendingCards from './PendingCards.jsx';
import Legacy from './Legacy.jsx';
import Codes from './Codes.jsx';
import Recurring from './Recurring.jsx';
import PersonForm from './PersonForm.jsx';
import FamilySettings, { DangerZone } from './FamilyTools.jsx';
import Balances from './family/Balances.jsx';
import OpenDebts from './family/OpenDebts.jsx';
import TeenOverview from './family/TeenOverview.jsx';
import PeopleList from './family/PeopleList.jsx';

// לשונית המשפחה (הורים), לפי הסדר: אישורים, כסף, אנשים, הגדרות משפחה ואזור מסוכן.
export default function FamilyTab({ data, fdata, token }) {
  const { me } = useApp();
  const { nameOf } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const debts = openDebts(data.people, data.entries);
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];

  return (
    <>
      <PendingCards data={data} token={token} parentView />

      <h2>יתרות</h2>
      <Balances people={data.people} debts={debts} />

      <h2>כל החובות הפתוחים</h2>
      <OpenDebts debts={debts} token={token} nameOf={nameOf} />

      <h2>דמי כיס קבועים</h2>
      <p className="hint">רישום חוב אוטומטי, שבועי או חודשי, בלי להקליד כל פעם.</p>
      <Recurring data={data} token={token} />

      <TeenOverview teens={teens} />

      <h2>בני המשפחה</h2>
      <PeopleList people={data.people} me={me} token={token} />
      <PersonForm token={token} />
      <Codes data={data} token={token} />

      <h2>הגדרות המשפחה</h2>
      <Legacy token={token} />
      <FamilySettings data={data} />

      <h2>אזור מסוכן</h2>
      <DangerZone data={data} token={token} />
    </>
  );
}
