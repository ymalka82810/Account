import { t } from '../../i18n/index.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// חלון אישור מעוצב במקום confirm() של הדפדפן.
// שימוש: const confirm = useConfirm(); if (!(await confirm({ title, message, amount, okText }))) return;
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null); // {opts, resolve}
  const okBtn = useRef(null);
  const returnFocus = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    returnFocus.current = document.activeElement;
    setReq({ opts, resolve });
  }), []);

  const answer = useCallback((value) => {
    setReq((cur) => {
      if (cur) cur.resolve(value);
      return null;
    });
    const f = returnFocus.current;
    returnFocus.current = null;
    if (f && f.focus) setTimeout(() => f.focus(), 0);
  }, []);

  useEffect(() => {
    if (!req) return undefined;
    if (okBtn.current) okBtn.current.focus();
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); answer(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [req, answer]);

  const value = useMemo(() => confirm, [confirm]);
  const o = req ? req.opts : {};

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      {req && (
        <div className="confirm-wrap">
          <div className="confirm-bg" onClick={() => answer(false)} />
          <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMsg">
            {o.icon && <div className="confirm-icon" aria-hidden="true">{o.icon}</div>}
            <h2 id="confirmTitle" className="confirm-title">{o.title}</h2>
            {o.amount && <div className="confirm-amount">{o.amount}</div>}
            <p id="confirmMsg" className="confirm-msg">{o.message}</p>
            {o.rows && o.rows.length > 0 && (
              <div className="confirm-rows">
                {o.rowsTitle && <div className="confirm-rows-title">{o.rowsTitle}</div>}
                {o.rows.map((r, i) => (
                  <div className={'confirm-row' + (r.strong ? ' strong' : '')} key={i}>
                    <span>{r.label}</span><span className="confirm-row-val">{r.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="confirm-actions">
              <button ref={okBtn} type="button" className={'primary' + (o.danger ? ' danger-fill' : '')} onClick={() => answer(true)}>{o.okText || t('אישור')}</button>
              <button type="button" className="ghost" onClick={() => answer(false)}>{o.cancelText || t('ביטול')}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
