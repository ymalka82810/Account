import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx } from '../../state/appContext.js';
import { t } from '../../i18n/index.js';
import Arrow from './Arrow.jsx';

// החלון הקופץ. sheet.open(title, <Body />) פותח חלון חדש מעל הקודם (מחסנית): בחלון השני ומעלה יש בכותרת חץ חזרה,
// והחלונות שמתחת נשארים בזיכרון עם מה שהוזן בהם. sheet.back() סוגר רק את העליון, ו-sheet.close() סוגר הכול.
// כל חלון מוסיף רשומה להיסטוריית הדפדפן, כך שכפתור "חזרה" של אנדרואיד או הדפדפן סוגר חלון אחד (או חוזר שלב),
// ולא יוצא מהמסך. הגוף יכול לקרוא ל-useSheet() בעצמו כדי לסגור או לשנות את הכותרת של החלון שלו.
const SheetCtx = createContext(null);
export const useSheet = () => useContext(SheetCtx);

// קובע את כותרת החלון לפי השלב הנוכחי של הקומפוננטה.
export function useSheetTitle(title) {
  const { setTitle } = useSheet();
  useEffect(() => { setTitle(title); }, [title, setTitle]);
}

// היסטוריה: כל חלון בעומק n רושם state של {kupaSheet: n}. לשאר הניווט באפליקציה (לשוניות, הגדרות הפנקס) אין state,
// ולכן popstate שלהם נשאר בדיוק כמו קודם: ה-hash לא משתנה בגלל חלון.
const HIST_KEY = 'kupaSheet';
const histDepthOf = () => (history.state && history.state[HIST_KEY]) || 0;

export function SheetProvider({ children }) {
  const [stack, setStack] = useState([]); // [{key, title, body, revealFrom?, focusBack}] - האחרון מוצג
  const stackRef = useRef([]); // השתקפות סינכרונית של stack: כמה פעולות באותו רגע לא נשענות על רינדור
  const [reveal, setReveal] = useState(null); // {key, ready, origin?} של החלון הראשון (אנימציית הגדילה)
  const closeBtn = useRef(null);
  const sheetElRef = useRef(null);
  const counter = useRef(0);
  const histDepth = useRef(0); // כמה רשומות היסטוריה פתחנו (אחרי כל הפעולות שבתור)
  const histQueue = useRef(Promise.resolve()); // פעולות היסטוריה לפי הסדר: go() אסינכרוני ולא מתערבב עם pushState שאחריו
  const ignorePops = useRef(0); // popstate שאנחנו עצמנו גרמנו לו (סגירה מהכפתור) ולא "חזרה" של המשתמש

  const queue = (fn) => { histQueue.current = histQueue.current.then(fn).catch(() => {}); };
  const syncHistory = useCallback((len) => {
    const have = histDepth.current;
    if (len > have) {
      for (let n = have + 1; n <= len; n++) queue(() => history.pushState({ [HIST_KEY]: n }, '', location.href));
    } else if (len < have) {
      queue(() => new Promise(/** @param {(v?: any) => void} resolve */ (resolve) => {
        // מישהו ניווט במקום אחר מאז שנפתח החלון: לא מזיזים את ההיסטוריה (שלא נחזור מעבר למה שפתחנו)
        if (histDepthOf() !== have) { resolve(); return; }
        ignorePops.current += 1;
        let timer = 0;
        const done = () => { window.removeEventListener('popstate', done); clearTimeout(timer); resolve(); };
        window.addEventListener('popstate', done);
        timer = window.setTimeout(() => { ignorePops.current = Math.max(0, ignorePops.current - 1); done(); }, 500);
        history.go(len - have);
      }));
    }
    histDepth.current = len;
  }, []);

  // מחליף את המחסנית; חלון שנסגר מחזיר את הפוקוס לכפתור שפתח אותו.
  const commit = useCallback((next) => {
    const prev = stackRef.current;
    stackRef.current = next;
    setStack(next);
    if (next.length < prev.length) {
      const f = prev[next.length].focusBack;
      if (f && f.focus) setTimeout(() => f.focus(), 0);
    }
  }, []);

  // revealFrom (אופציונלי): {x, y} בפיקסלי המסך - הנקודה שממנה האריח "נובט" בגדילה,
  // למשל המקום שבו נעלם גלגל השיניים המונפש לפני פתיחת האריח.
  const open = useCallback((title, body, revealFrom) => {
    counter.current += 1;
    const entry = { key: counter.current, title, body, revealFrom, focusBack: document.activeElement };
    const next = [...stackRef.current, entry];
    commit(next);
    syncHistory(next.length);
  }, [commit, syncHistory]);
  const back = useCallback(() => {
    const cur = stackRef.current;
    if (!cur.length) return;
    commit(cur.slice(0, -1));
    syncHistory(cur.length - 1);
  }, [commit, syncHistory]);
  const close = useCallback(() => {
    if (!stackRef.current.length) return;
    commit([]);
    syncHistory(0);
  }, [commit, syncHistory]);
  const setTitleOf = useCallback((key, title) => {
    const cur = stackRef.current;
    if (!cur.some((e) => e.key === key && e.title !== title)) return;
    const next = cur.map((e) => (e.key === key ? { ...e, title } : e));
    stackRef.current = next;
    setStack(next);
  }, []);
  // החלון מוצג מחוץ ל-App, לכן App מעביר לכאן את ההקשר שלו כדי שהגוף יוכל לקרוא ל-useApp().
  const [appCtx, setAppCtx] = useState(null);

  // ערך ההקשר חייב להיות יציב: אחרת כל רינדור כאן יוצר אובייקט חדש, App מעביר
  // שוב setAppCtx, וזו לולאת רינדורים אינסופית שגם מאפסת טיימרים של הצרכנים.
  // setTitle ללא חלון מסוים משנה את העליון; בתוך חלון כל גוף מקבל setTitle שמשנה רק את הכותרת שלו.
  const ctxValue = useMemo(() => ({
    open, back, close, setAppCtx,
    setTitle: (title) => { const top = stackRef.current[stackRef.current.length - 1]; if (top) setTitleOf(top.key, title); },
  }), [open, back, close, setTitleOf]);
  const entryCtxs = useRef(new Map());
  const ctxOf = (key) => {
    let c = entryCtxs.current.get(key);
    if (!c) { c = { ...ctxValue, setTitle: (title) => setTitleOf(key, title) }; entryCtxs.current.set(key, c); }
    return c;
  };
  useEffect(() => {
    const live = new Set(stack.map((e) => e.key));
    for (const k of entryCtxs.current.keys()) if (!live.has(k)) entryCtxs.current.delete(k);
  }, [stack]);

  const top = stack[stack.length - 1] || null;
  const first = stack[0] || null;
  const topKey = top && top.key;
  useEffect(() => { if (topKey && closeBtn.current) closeBtn.current.focus(); }, [topKey]);

  // כשנפתח אריח עם נקודת מוצא, ממתינים לרינדור ומודדים את מיקומו כדי לקבוע
  // את מרכז הגדילה (transform-origin) בדיוק על אותה נקודה.
  const firstKey = first && first.key;
  const revealFrom = first && first.revealFrom;
  useEffect(() => {
    if (!firstKey || !revealFrom) return undefined;
    const id = requestAnimationFrame(() => {
      const el = sheetElRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const { x, y } = revealFrom;
      const originX = rect && rect.width ? ((x - rect.left) / rect.width) * 100 : 50;
      const originY = rect && rect.height ? ((y - rect.top) / rect.height) * 100 : 50;
      setReveal({ key: firstKey, origin: { x: originX, y: originY } });
    });
    return () => cancelAnimationFrame(id);
  }, [firstKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealReady = !!revealFrom && !!reveal && reveal.key === firstKey;

  // כפתור "חזרה" של הטלפון או הדפדפן: סוגר את החלון העליון (המחסנית מתקצרת לעומק שברשומה שחזרנו אליה).
  useEffect(() => {
    // רענון עם חלון פתוח משאיר state ישן בהיסטוריה, אבל בלי חלון.
    if (histDepthOf()) history.replaceState(null, '', location.href);
    const onPop = () => {
      if (ignorePops.current > 0) { ignorePops.current -= 1; return; }
      const k = histDepthOf();
      const cur = stackRef.current;
      if (k < cur.length) { histDepth.current = k; commit(cur.slice(0, k)); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [commit]);

  const isOpen = stack.length > 0;
  useEffect(() => {
    document.body.classList.toggle('noscroll', isOpen);
    if (!isOpen) return undefined;
    const onKey = (ev) => { if (ev.key === 'Escape') back(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, back]);

  return (
    <SheetCtx.Provider value={ctxValue}>
      {children}
      <div className="sheet-wrap" hidden={!isOpen}>
        <div className={'sheet-bg' + (revealFrom ? ' sheet-bg-reveal' : '')} onClick={close} />
        <div
          ref={sheetElRef}
          className={'sheet' + (revealFrom ? (revealReady ? ' sheet-reveal' : ' sheet-reveal-pending') : '')}
          style={revealReady ? { transformOrigin: `${reveal.origin.x}% ${reveal.origin.y}%` } : undefined}
          role="dialog" aria-modal="true" aria-labelledby="sheetTitle"
        >
          <div className="sheet-head">
            {stack.length > 1 && (
              <button className="ghost sheet-back" type="button" aria-label={t('חזרה')} onClick={back}><Arrow kind="back" /></button>
            )}
            <h2 id="sheetTitle">{top ? top.title : ''}</h2>
            <button ref={closeBtn} className="ghost" type="button" aria-label={t('סגירה')} onClick={close}>✕</button>
          </div>
          {stack.map((e, i) => (
            <div key={e.key} hidden={i !== stack.length - 1}>
              <SheetCtx.Provider value={ctxOf(e.key)}><AppCtx.Provider value={appCtx}>{e.body}</AppCtx.Provider></SheetCtx.Provider>
            </div>
          ))}
        </div>
      </div>
    </SheetCtx.Provider>
  );
}
