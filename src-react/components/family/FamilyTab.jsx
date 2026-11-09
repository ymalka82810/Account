import PushPrompt from '../account/PushPrompt.jsx';
import { t } from '../../i18n/index.js';
import { useSheet } from '../shared/Sheet.jsx';
import { openDebts } from '../../lib/computations.js';
import PendingCards from '../entries/PendingCards.jsx';
import Balances from './Balances.jsx';
import { OpenDebtsSheet } from './OpenDebts.jsx';
import TeenOverview from './TeenOverview.jsx';
import { NotebookMergeCard } from '../manage/NotebookMerge.jsx';
import Summary, { StatsSheet } from './Summary.jsx';
import Arrow from '../shared/Arrow.jsx';

// לשונית המשפחה (הורים): אישורים, סיכום חודשי ורשימה קצרה של בני המשפחה. הכול הנוסף (דף אישי, חובות פתוחים, גרף)
// נפתח בחלון תחתון, כך שהלשונית נשארת קצרה גם עם עשרה ילדים. הגדרות וניהול נמצאים בלשונית "ניהול".
export default function FamilyTab({ data, fdata, token }) {
  const sheet = useSheet();
  const debts = openDebts(data.people, data.entries);
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];

  return (
    <>
      <PushPrompt />
      <PendingCards data={data} token={token} parentView />
      <NotebookMergeCard />

      <Summary entries={data.entries} onMore={() => sheet.open(t('גרף חובות והחזרים לפי חודש'), <StatsSheet />)} />

      <h2>{t('בני המשפחה')}</h2>
      <Balances people={data.people} debts={debts} />
      <button className="fam-row fam-link" type="button" onClick={() => sheet.open(t('כל החובות הפתוחים'), <OpenDebtsSheet />)}>
        <span className="fam-name">{t('כל החובות הפתוחים')}</span>
        {debts.length > 0 && <span className="fam-badge">{debts.length}</span>}
        <Arrow kind="chev-next" />
      </button>

      <TeenOverview teens={teens} />
    </>
  );
}
