import { setDetailsOpen, toggleDetails } from '../../lib/motion.js';

// אריח נפתח/נסגר להגדרה בודדת (לדוגמה בלשונית הניהול), כדי שרשימת ההגדרות לא תהיה ארוכה מדי.
// ההסבר (subtitle) מוצג בתוך הגוף, מעל התוכן, ולא בכותרת, כדי שכל הכותרות ייראו אותו דבר.
// שם קבוצה (name) הופך את האריחים לבלעדיים: פתיחת אחד סוגרת את האחרים.
// הפתיחה והסגירה מונפשות (lib/motion.js), במקום שהתוכן יקפוץ פתאום למטה. הסימון נשאר details/summary.
export default function Collapsible({ title, subtitle, defaultOpen, name, children }) {
  function onSummary(ev) {
    const details = ev.currentTarget.parentElement;
    const opening = toggleDetails(ev);
    if (!opening || !name) return;
    /** @type {NodeListOf<HTMLDetailsElement>} */
    const tiles = document.querySelectorAll('details.tile-section[data-group]');
    tiles.forEach((other) => {
      if (other !== details && other.dataset.group === name && other.open) setDetailsOpen(other, false);
    });
  }
  return (
    <details className="tile-section" data-group={name} open={defaultOpen || undefined}>
      <summary onClick={onSummary}>
        <span className="tile-title">{title}</span>
      </summary>
      <div className="tile-body">
        {subtitle && <p className="hint">{subtitle}</p>}
        {children}
      </div>
    </details>
  );
}
