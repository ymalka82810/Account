import { useApp } from '../../state/appContext.js';
import Legacy from './Legacy.jsx';
import Codes from './Codes.jsx';
import Recurring from './Recurring.jsx';
import PersonForm from './PersonForm.jsx';
import FamilySettings, { DangerZone } from './FamilyTools.jsx';
import PeopleList from './PeopleList.jsx';
import Collapsible from '../shared/Collapsible.jsx';

// לשונית הניהול (הורים): אריח נפתח לכל הגדרה - בני משפחה, קודים, דמי כיס קבועים, הגדרות ואזור מסוכן.
export default function ManageTab({ data, token }) {
  const { me } = useApp();
  return (
    <>
      <Legacy token={token} />

      <Collapsible name="manage-tiles" title="בני המשפחה" defaultOpen>
        <PeopleList people={data.people} me={me} token={token} />
        <PersonForm token={token} />
      </Collapsible>

      <Collapsible name="manage-tiles" title="קודי הצטרפות">
        <Codes data={data} token={token} />
      </Collapsible>

      <Collapsible name="manage-tiles" title="דמי כיס קבועים" subtitle="רישום חוב אוטומטי, שבועי או חודשי, בלי להקליד כל פעם.">
        <Recurring data={data} token={token} />
      </Collapsible>

      <Collapsible name="manage-tiles" title="הגדרות המשפחה">
        <FamilySettings data={data} />
      </Collapsible>

      <Collapsible name="manage-tiles" title="אזור מסוכן">
        <DangerZone data={data} token={token} />
      </Collapsible>
    </>
  );
}
