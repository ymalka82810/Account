import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { openDebts, namesFor } from '../../lib/computations.js';
import PendingCards from '../entries/PendingCards.jsx';
import Balances from './Balances.jsx';
import OpenDebts from './OpenDebts.jsx';
import TeenOverview from './TeenOverview.jsx';
import { NotebookMergeCard } from '../manage/NotebookMerge.jsx';
import Summary from './Summary.jsx';
import Goals from '../goals/Goals.jsx';
import Achievements from '../goals/Achievements.jsx';
import { reducedMotion } from '../../lib/feel.js';

// לשונית המשפחה (הורים): אישורים, יתרות, חובות פתוחים ומה שהנוער רושם. הגדרות וניהול נמצאים בלשונית "ניהול".
export default function FamilyTab({ data, fdata, token }) {
  const { me } = useApp();
  const { owesLine } = namesFor(me, (id) => data.people.find((p) => p.id === id));
  const debts = openDebts(data.people, data.entries);
  const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];
  const sections = [['sec-balances', t('יתרות')], ['sec-debts', t('כל החובות הפתוחים')], ...(teens.length ? [['sec-teens', t('מה הנוער רושם עם חברים')]] : [])];
  const jump = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); };

  return (
    <>
      <PendingCards data={data} token={token} parentView />
      <NotebookMergeCard />

      {/* קפיצות עוגן: הלשונית ארוכה, והקישורים נשארים צמודים מתחת ללשוניות בזמן הגלילה */}
      <nav className="sec-jump" aria-label={t('קפיצה לקטע')}>
        {sections.map(([id, label]) => <button key={id} className="ghost small" type="button" onClick={() => jump(id)}>{label}</button>)}
      </nav>

      <h2 id="sec-balances" className="sec-h">{t('יתרות')}</h2>
      <Balances people={data.people} debts={debts} />

      <h2 id="sec-debts" className="sec-h">{t('כל החובות הפתוחים')}</h2>
      <OpenDebts debts={debts} owesLine={owesLine} />

      <Goals data={data} token={token} />

      {data.people.filter((p) => p.role !== 'parent').map((p) => (
        <Achievements key={p.id} title={t('הישגים: {name}', { name: p.name })} personId={p.id} entries={data.entries} goals={data.goals} />
      ))}

      <Summary people={data.people} entries={data.entries} />

      <TeenOverview teens={teens} />
    </>
  );
}
