import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// תפריט בחירה מעוצב משלנו (במקום <select> עם רשימת ברירת המחדל של הדפדפן/מערכת ההפעלה),
// כדי שהעיצוב יתאים לערכת הנושא של כל רמת משתמש (ילד/נער/הורה).
export default function Select({ value, onChange, options, className = '', placeholder = '' }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const estHeight = Math.min(options.length * 42 + 12, 280);
    const openAbove = r.bottom + estHeight > window.innerHeight && r.top > estHeight;
    setPos(openAbove
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6 }
      : { left: r.left, width: r.width, top: r.bottom + 6 });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onOutside(e) {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onReflow() { place(); }
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(idx) {
    const opt = options[idx];
    if (opt) onChange(opt.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIdx); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  }

  const current = options.find((o) => o.value === value);

  return (
    <div className={'dd' + (className ? ' ' + className : '')} ref={rootRef}>
      <button type="button" ref={btnRef} className="dd-btn" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { if (!open) setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((o) => !o); }}
        onKeyDown={onKeyDown}>
        <span className="dd-val">{current ? current.label : placeholder}</span>
        <span className="dd-arrow" aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <ul className="dd-list" role="listbox" style={pos}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}
              className={'dd-opt' + (o.value === value ? ' sel' : '') + (i === activeIdx ? ' active' : '')}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(i)}>
              {o.label}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
