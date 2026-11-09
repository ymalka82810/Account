// מצב אבחון זמני להחלקה בין לשוניות: נדלק עם ?debug=swipe בכתובת (נשמר ללשונית הדפדפן עד סגירתה).
// לכל מגע מודד כמה הכותרת זזה בפועל (מיקום אמיתי ב-DOM), גלילה, זום, רוחב הדף ואירועי ביטול,
// ומציג סיכום בפס קטן בתחתית המסך. אם הכותרת "זזה" בעין אבל כאן היא לא זזה - התזוזה היא אפקט של הדפדפן עצמו.
const KEY = 'kupa-debug-swipe';

export function initSwipeDebug() {
  try {
    if (new URLSearchParams(location.search).get('debug') === 'swipe') sessionStorage.setItem(KEY, '1');
    if (sessionStorage.getItem(KEY) !== '1') return;
  } catch { return; }

  const box = document.createElement('div');
  box.setAttribute('dir', 'ltr');
  box.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;z-index:99999;max-height:38vh;overflow:auto;'
    + 'background:rgba(0,0,0,.82);color:#7f7;font:11px/1.35 monospace;padding:6px;border-radius:8px;white-space:pre-wrap;pointer-events:auto';
  const lines = /** @type {string[]} */ ([]);
  const show = () => { box.textContent = lines.join('\n'); };
  const add = (/** @type {string} */ s) => { lines.unshift(s); if (lines.length > 14) lines.pop(); show(); };
  const attach = () => { if (document.body && !box.isConnected) document.body.appendChild(box); };
  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: false });

  const r = (/** @type {number} */ n) => Math.round(n * 10) / 10;
  /** @type {null | { n: number, hx: number[], hy: number[], sx: number[], vx: number[], vs: number[], dw: number[], ev: Set<string>, t0: number, sel: string }} */
  let g = null;
  let count = 0;
  const sample = () => {
    if (!g) return;
    const h = document.querySelector('header.top');
    if (h) { const b = h.getBoundingClientRect(); g.hx.push(b.left); g.hy.push(b.top); }
    g.sx.push(window.scrollX);
    const vv = window.visualViewport;
    if (vv) { g.vx.push(vv.offsetLeft + vv.pageLeft); g.vs.push(vv.scale); }
    g.dw.push(document.documentElement.scrollWidth - window.innerWidth);
  };
  const span = (/** @type {number[]} */ a) => (a.length ? `${r(Math.min(...a))}..${r(Math.max(...a))}` : '-');
  const end = () => {
    if (!g) return;
    sample();
    const d = g;
    g = null;
    const hMove = d.hx.length ? r(Math.max(...d.hx) - Math.min(...d.hx)) : 0;
    add(`#${d.n} ${Math.round(performance.now() - d.t0)}ms tab=${d.sel} hist=${history.length}\n`
      + `  header.left ${span(d.hx)} (moved ${hMove}px)  header.top ${span(d.hy)}\n`
      + `  scrollX ${span(d.sx)}  vv.left ${span(d.vx)}  zoom ${span(d.vs)}  extraW ${span(d.dw)}\n`
      + `  events: ${[...d.ev].join(',')}`);
  };
  const sel = () => document.querySelector('nav.tabs [aria-selected="true"]')?.getAttribute('data-tab') || '?';

  const opt = { capture: true, passive: true };
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    g = { n: ++count, hx: [], hy: [], sx: [], vx: [], vs: [], dw: [], ev: new Set(['touchstart']), t0: performance.now(), sel: sel() };
    sample();
  }, opt);
  for (const type of ['touchmove', 'pointermove', 'pointercancel', 'touchcancel', 'pointerup', 'scroll', 'lostpointercapture', 'popstate']) {
    window.addEventListener(type, (e) => {
      if (!g) return;
      g.ev.add(type === 'pointercancel' || type === 'touchcancel' ? `${type.toUpperCase()}` : type);
      if (type === 'touchmove' && !(/** @type {TouchEvent} */ (e)).cancelable) g.ev.add('touchmove-NOT-cancelable');
      sample();
    }, opt);
  }
  window.visualViewport?.addEventListener('scroll', () => { if (g) { g.ev.add('vv-scroll'); sample(); } });
  window.visualViewport?.addEventListener('resize', () => { if (g) { g.ev.add('vv-resize'); sample(); } });
  // אחרי השחרור ממשיכים למדוד עוד חצי שנייה (אנימציית היציאה/כניסה), ואז מסכמים.
  window.addEventListener('touchend', () => {
    if (!g) return;
    g.ev.add('touchend');
    const cur = g;
    const tick = () => { if (g !== cur) return; sample(); if (performance.now() - cur.t0 < 1500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { if (g === cur) end(); }, 700);
  }, opt);
  add(`swipe debug on  vw=${innerWidth} dpr=${devicePixelRatio} ua=${navigator.userAgent.replace(/.*(Chrome\/[\d.]+).*/, '$1')}`);
}
