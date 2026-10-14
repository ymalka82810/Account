import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppCtx } from '../../state/appContext.js';

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
  const [sheet, setSheet] = useState(null); // {key, title, body}
  const returnFocus = useRef(null);
  const closeBtn = useRef(null);
  const counter = useRef(0);

  const open = useCallback((title, body) => {
    setSheet((cur) => {
      if (!cur) returnFocus.current = document.activeElement;
      counter.current += 1;
      return { key: counter.current, title, body };
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

  const key = sheet && sheet.key;
  useEffect(() => { if (key && closeBtn.current) closeBtn.current.focus(); }, [key]);
  useEffect(() => {
    document.body.classList.toggle('noscroll', !!sheet);
    if (!sheet) return undefined;
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [!!sheet, close]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SheetCtx.Provider value={{ open, close, setTitle, setAppCtx }}>
      {children}
      <div className="sheet-wrap" hidden={!sheet}>
        <div className="sheet-bg" onClick={close} />
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
          <div className="sheet-head">
            <h2 id="sheetTitle">{sheet ? sheet.title : ''}</h2>
            <button ref={closeBtn} className="ghost" type="button" aria-label="סגירה" onClick={close}>✕</button>
          </div>
          <div key={sheet ? sheet.key : 0}>{sheet && <AppCtx.Provider value={appCtx}>{sheet.body}</AppCtx.Provider>}</div>
        </div>
      </div>
    </SheetCtx.Provider>
  );
}
