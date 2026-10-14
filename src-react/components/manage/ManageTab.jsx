import { useApp } from '../../state/appContext.js';
import Legacy from './Legacy.jsx';
import Codes from './Codes.jsx';
import Recurring from './Recurring.jsx';
import PersonForm from './PersonForm.jsx';
import FamilySettings, { DangerZone } from './FamilyTools.jsx';
import PeopleList from './PeopleList.jsx';

// לשונית הניהול (הורים): בני משפחה, קודים, דמי כיס קבועים, הגדרות ואזור מסוכן.
export default function ManageTab({ data, token }) {
  const { me } = useApp();
  return (
    <>
      <h2>בני המשפחה</h2>
      <PeopleList people={data.people} me={me} token={token} />
      <PersonForm token={token} />
      <Codes data={data} token={token} />

      <h2>דמי כיס קבועים</h2>
      <p className="hint">רישום חוב אוטומטי, שבועי או חודשי, בלי להקליד כל פעם.</p>
      <Recurring data={data} token={token} />

      <h2>הגדרות המשפחה</h2>
      <Legacy token={token} />
      <FamilySettings data={data} />

      <h2>אזור מסוכן</h2>
      <DangerZone data={data} token={token} />
    </>
  );
}
