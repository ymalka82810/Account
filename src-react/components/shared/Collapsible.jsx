// אריח נפתח/נסגר להגדרה בודדת (לדוגמה בלשונית הניהול), כדי שרשימת ההגדרות לא תהיה ארוכה מדי.
// ההסבר (subtitle) מוצג בתוך הגוף, מעל התוכן, ולא בכותרת, כדי שכל הכותרות ייראו אותו דבר.
// שם קבוצה (name) הופך את האריחים לבלעדיים: פתיחת אחד סוגרת את האחרים.
// הפתיחה והסגירה מונפשות (גובה + שקיפות), במקום שהתוכן יקפוץ פתאום למטה. הסימון נשאר details/summary.
const DURATION = 260;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// מעביר אריח למצב פתוח/סגור עם אנימציה. אנימציה שרצה כרגע מתבטלת ומתחילה מהגובה הנוכחי.
function setOpen(details, open) {
  const body = details.querySelector(':scope > .tile-body');
  if (!body || reducedMotion() || typeof body.animate !== 'function') {
    details.open = open;
    return;
  }
  const from = details._anim ? body.offsetHeight : open ? 0 : body.offsetHeight;
  const padBottom = parseFloat(getComputedStyle(body).paddingBottom) || 0;
  details._anim?.cancel();
  details.classList.toggle('closing', !open);
  details.open = true;
  body.style.overflow = 'hidden';
  const natural = body.scrollHeight;
  const shut = { height: '0px', paddingBottom: '0px', opacity: 0 };
  const full = { height: `${natural}px`, paddingBottom: `${padBottom}px`, opacity: 1 };
  const start = from === 0 ? shut : { height: `${from}px`, paddingBottom: `${padBottom}px`, opacity: 1 };
  const anim = body.animate(open ? [start, full] : [start, shut], { duration: DURATION, easing: EASE });
  details._anim = anim;
  anim.onfinish = () => {
    details._anim = null;
    body.style.overflow = '';
    details.open = open;
    details.classList.remove('closing');
  };
  anim.oncancel = () => { body.style.overflow = ''; };
}

export default function Collapsible({ title, subtitle, defaultOpen, name, children }) {
  function toggle(ev) {
    ev.preventDefault();
    const details = ev.currentTarget.parentElement;
    const opening = !details.open || details.classList.contains('closing');
    if (opening && name) {
      /** @type {NodeListOf<HTMLDetailsElement>} */
      const tiles = document.querySelectorAll('details.tile-section[data-group]');
      tiles.forEach((other) => {
        if (other !== details && other.dataset.group === name && other.open) setOpen(other, false);
      });
    }
    setOpen(details, opening);
  }
  return (
    <details className="tile-section" data-group={name} open={defaultOpen || undefined}>
      <summary onClick={toggle}>
        <span className="tile-title">{title}</span>
      </summary>
      <div className="tile-body">
        {subtitle && <p className="hint">{subtitle}</p>}
        {children}
      </div>
    </details>
  );
}
