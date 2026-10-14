// אריח נפתח/נסגר להגדרה בודדת (לדוגמה בלשונית הניהול), כדי שרשימת ההגדרות לא תהיה ארוכה מדי.
export default function Collapsible({ title, subtitle, defaultOpen, children }) {
  return (
    <details className="tile-section" open={defaultOpen || undefined}>
      <summary>
        <span className="tile-title">{title}</span>
        {subtitle && <span className="hint">{subtitle}</span>}
      </summary>
      <div className="tile-body">{children}</div>
    </details>
  );
}
