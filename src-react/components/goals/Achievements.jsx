import { t } from '../../i18n/index.js';
import { achievementsOf } from '../../lib/stats.js';

const TEXT = {
  firstRepay: () => [t('החזרה ראשונה'), t('החזרת חוב בפעם הראשונה')],
  streak1: () => [t('שבוע נקי'), t('שבוע שלם בלי חובות פתוחים')],
  streak3: () => [t('3 שבועות ברצף'), t('החזרת הכול 3 שבועות ברצף')],
  streak8: () => [t('8 שבועות ברצף'), t('החזרת הכול 8 שבועות ברצף')],
  goalDone: () => [t('הגשמת יעד'), t('חסכת עד שהגעת ליעד')],
};

// הישגים של אדם אחד: מושגים בצבע, והשאר מעומעמים עם התקדמות ברצפים.
export default function Achievements({ personId, entries, goals, title }) {
  const list = achievementsOf(personId, entries, goals);
  return (
    <>
      {title && <h2>{title}</h2>}
      <div className="ach-grid">
        {list.map((a) => {
          const [name, how] = TEXT[a.id]();
          return (
            <div className={'ach' + (a.earned ? ' on' : '')} key={a.id} title={how}>
              <div className="ach-icon" aria-hidden="true">{a.icon}</div>
              <div className="ach-name">{name}</div>
              <div className="hint">{a.earned ? t('הושג ✅') : a.goal ? t('{n} מתוך {goal}', { n: a.progress, goal: a.goal }) : how}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
