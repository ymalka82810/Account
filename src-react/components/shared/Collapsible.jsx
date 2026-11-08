// אריח נפתח/נסגר להגדרה בודדת (לדוגמה בלשונית הניהול), כדי שרשימת ההגדרות לא תהיה ארוכה מדי.
// ההסבר (subtitle) מוצג בתוך הגוף, מעל התוכן, ולא בכותרת, כדי שכל הכותרות ייראו אותו דבר.
// שם קבוצה (name) הופך את האריחים לבלעדיים: פתיחת אחד סוגרת את האחרים.
export default function Collapsible({ title, subtitle, defaultOpen, name, children }) {
  return (
    <details className="tile-section" name={name} open={defaultOpen || undefined}>
      <summary>
        <span className="tile-title">{title}</span>
      </summary>
      <div className="tile-body">
        {subtitle && <p className="hint">{subtitle}</p>}
        {children}
      </div>
    </details>
  );
}
