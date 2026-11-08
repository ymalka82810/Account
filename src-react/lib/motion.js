// אנימציית הצגה והסתרה של קטעים בממשק (גובה, ריווחים ושקיפות), כדי שתוכן לא יקפוץ פתאום למטה.
// משמש את Collapsible, את Reveal ואת הרשימות הנפתחות (details). מי שמגדיר "הפחתת תנועה" במכשיר מקבל החלפה מיידית.
const DURATION = 340;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';

/** @type {WeakMap<Element, Animation>} */
const running = new WeakMap();

export const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const canAnimate = (/** @type {HTMLElement} */ el) => !reducedMotion() && typeof el.animate === 'function';

// הרווח (gap) של ההורה כשהוא grid/flex: קטע שנעלם מוריד גם את הרווח שלידו, ואותו מכווצים בהדרגה כדי שלא יהיה קפיצה בסוף.
export function gapOf(/** @type {HTMLElement} */ el) {
  const parent = el.parentElement;
  if (!parent) return 0;
  const cs = getComputedStyle(parent);
  return /grid|flex/.test(cs.display) ? parseFloat(cs.rowGap) || 0 : 0;
}

const snapshot = (/** @type {HTMLElement} */ el) => {
  const cs = getComputedStyle(el);
  return { height: cs.height, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: cs.opacity };
};

// פותח (open=true) או סוגר אלמנט בהחלקה. אנימציה שרצה כרגע מתבטלת וההמשך מתחיל מהמצב הנוכחי שלה.
export function slide(/** @type {HTMLElement} */ el, /** @type {boolean} */ open, gap = 0, /** @type {(() => void) | undefined} */ done = undefined) {
  const prev = running.get(el);
  const cur = prev ? snapshot(el) : null;
  prev?.cancel();
  const cs = getComputedStyle(el);
  const px = (/** @type {string} */ v) => `${parseFloat(v) || 0}px`;
  el.style.overflow = 'hidden';
  const full = { height: `${el.scrollHeight}px`, paddingTop: px(cs.paddingTop), paddingBottom: px(cs.paddingBottom), marginTop: px(cs.marginTop), marginBottom: '0px', opacity: 1 };
  const shut = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: `${-gap}px`, opacity: 0 };
  const anim = el.animate(open ? [cur ?? shut, full] : [cur ?? full, shut], { duration: DURATION, easing: EASE });
  running.set(el, anim);
  anim.onfinish = () => {
    running.delete(el);
    el.style.overflow = '';
    done?.();
  };
  return anim;
}

// פותח/סוגר details בהחלקה. התוכן נשאר מוצג (open) עד סוף הסגירה; הכיתה closing מאפשרת לחץ להתהפך מיד.
export function setDetailsOpen(/** @type {HTMLDetailsElement} */ details, /** @type {boolean} */ open) {
  const body = /** @type {HTMLElement | null} */ (details.querySelector(':scope > :not(summary)'));
  if (!body || !canAnimate(body)) {
    details.open = open;
    return;
  }
  details.classList.toggle('closing', !open);
  details.open = true;
  slide(body, open, 0, () => {
    details.open = open;
    details.classList.remove('closing');
  });
}

// מטפל לחיצה על summary: מחליף את הפתיחה הרגילה של הדפדפן בפתיחה מונפשת. מחזיר את מצב היעד (true = נפתח).
export function toggleDetails(/** @type {import('react').MouseEvent<HTMLElement>} */ ev) {
  ev.preventDefault();
  const details = /** @type {HTMLDetailsElement} */ (ev.currentTarget.parentElement);
  const opening = !details.open || details.classList.contains('closing');
  setDetailsOpen(details, opening);
  return opening;
}
