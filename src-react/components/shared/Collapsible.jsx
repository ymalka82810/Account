// אריח נפתח/נסגר להגדרה בודדת (לדוגמה בלשונית הניהול), כדי שרשימת ההגדרות לא תהיה ארוכה מדי.
// שם קבוצה (name) הופך את האריחים לבלעדיים: פתיחת אחד סוגרת את האחרים.
export default function Collapsible({ title, subtitle, defaultOpen, name, children }) {
  return (
    <details className="tile-section" name={name} open={defaultOpen || undefined}>
      <summary>
        <span className="tile-title">{title}</span>
        {subtitle && <span className="hint">{subtitle}</span>}
      </summary>
      <div className="tile-body">{children}</div>
    </details>
  );
}
