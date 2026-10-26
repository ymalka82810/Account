import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx } from '../../state/appContext.js';
import { t } from '../../i18n/index.js';

// החלון הקופץ. sheet.open(title, <Body />) מחליף את התוכן (גם כשכבר פתוח,
// כמו בשלבים של אשף), ו-sheet.close() סוגר. הגוף יכול לקרוא ל-useSheet() בעצמו
// כדי לסגור או לשנות את הכותרת.
const SheetCtx = createContext(null);
export const useSheet = () => useContext(SheetCtx);

// קובע את כותרת החלון לפי השלב הנוכחי של הקומפוננטה.
export function useSheetTitle(title) {
  const { setTitle } = useSheet();
  useEffect(() => { setTitle(title); }, [title, setTitle]);
}

export function SheetProvider({ children }) {
  const [sheet, setSheet] = useState(null); // {key, title, body, revealFrom?, revealReady?}
  const returnFocus = useRef(null);
  const closeBtn = useRef(null);
  const sheetElRef = useRef(null);
  const counter = useRef(0);

  // revealFrom (אופציונלי): {x, y} בפיקסלי המסך - הנקודה שממנה האריח "נובט" בגדילה,
  // למשל המקום שבו נעלם גלגל השיניים המונפש לפני פתיחת האריח.
  const open = useCallback((title, body, revealFrom) => {
    setSheet((cur) => {
      if (!cur) returnFocus.current = document.activeElement;
      counter.current += 1;
      return { key: counter.current, title, body, revealFrom, revealReady: false };
    });
  }, []);
  const close = useCallback(() => {
    setSheet((cur) => {
      if (!cur) return cur;
      const f = returnFocus.current;
      returnFocus.current = null;
      if (f && f.focus) setTimeout(() => f.focus(), 0);
      return null;
    });
  }, []);
  const setTitle = useCallback((title) => setSheet((cur) => (cur && cur.title !== title ? { ...cur, title } : cur)), []);
  // החלון מוצג מחוץ ל-App, לכן App מעביר לכאן את ההקשר שלו כדי שהגוף יוכל לקרוא ל-useApp().
  const [appCtx, setAppCtx] = useState(null);

  // ערך ההקשר חייב להיות יציב: אחרת כל רינדור כאן יוצר אובייקט חדש, App מעביר
  // שוב setAppCtx, וזו לולאת רינדורים אינסופית שגם מאפסת טיימרים של הצרכנים.
  const ctxValue = useMemo(() => ({ open, close, setTitle, setAppCtx }), [open, close, setTitle]);

  const key = sheet && sheet.key;
  useEffect(() => { if (key && closeBtn.current) closeBtn.current.focus(); }, [key]);
  // כשנפתח אריח עם נקודת מוצא, ממתינים לרינדור ומודדים את מיקומו כדי לקבוע
  // את מרכז הגדילה (transform-origin) בדיוק על אותה נקודה.
  useEffect(() => {
    if (!sheet || !sheet.revealFrom || sheet.revealReady) return;
    const id = requestAnimationFrame(() => {
      const el = sheetElRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const { x, y } = sheet.revealFrom;
      const originX = rect && rect.width ? ((x - rect.left) / rect.width) * 100 : 50;
      const originY = rect && rect.height ? ((y - rect.top) / rect.height) * 100 : 50;
      setSheet((cur) => (cur && cur.key === key ? { ...cur, revealReady: true, revealOrigin: { x: originX, y: originY } } : cur));
    });
    return () => cancelAnimationFrame(id);
  }, [sheet, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.body.classList.toggle('noscroll', !!sheet);
    if (!sheet) return undefined;
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [!!sheet, close]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SheetCtx.Provider value={ctxValue}>
      {children}
      <div className="sheet-wrap" hidden={!sheet}>
        <div className={'sheet-bg' + (sheet && sheet.revealFrom ? ' sheet-bg-reveal' : '')} onClick={close} />
        <div
          ref={sheetElRef}
          className={'sheet' + (sheet && sheet.revealFrom ? (sheet.revealReady ? ' sheet-reveal' : ' sheet-reveal-pending') : '')}
          style={sheet && sheet.revealOrigin ? { transformOrigin: `${sheet.revealOrigin.x}% ${sheet.revealOrigin.y}%` } : undefined}
          role="dialog" aria-modal="true" aria-labelledby="sheetTitle"
        >
          <div className="sheet-head">
            <h2 id="sheetTitle">{sheet ? sheet.title : ''}</h2>
            <button ref={closeBtn} className="ghost" type="button" aria-label={t('סגירה')} onClick={close}>✕</button>
          </div>
          <div key={sheet ? sheet.key : 0}>{sheet && <AppCtx.Provider value={appCtx}>{sheet.body}</AppCtx.Provider>}</div>
        </div>
      </div>
    </SheetCtx.Provider>
  );
}
