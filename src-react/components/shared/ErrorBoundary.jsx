import { Component } from 'react';
import { t } from '../../i18n/index.js';

// שגיאת רינדור באחד המסכים לא מפילה את כל העץ למסך לבן. ב-App.jsx כל לשונית ראשית עטופה בגבול משלה
// (שגיאה באחת לא פוגעת בשאר ובניווט), ו-index.jsx עוטף את השורש כגיבוי אחרון (root).
// המשתמש רואה הסבר קצר בשפת הממשק, בלי stack; הפרטים הטכניים רק ב-console.error.
// "נסו שוב" מאפס את הגבול ומרנדר את התוכן מחדש. הצבעים מגיעים ממשתני הערכה (ילד / נוער / הורה), כולל מצב כהה.
// אין בפרויקט @types/react: Component מטופל כ-any כדי ש-setState ו-props יעברו את בדיקת הטיפוסים.
/** @type {any} */
const Base = Component;

export default class ErrorBoundary extends Base {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary', error, info && info.componentStack);
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    const root = !!this.props.root;
    return (
      <div className={'err-box' + (root ? ' err-box--root' : '')} role="alert">
        <img className="big-coin" src="coin.webp" alt="" width="68" height="68" draggable="false" />
        <h2>{t('משהו השתבש')}</h2>
        <p className="hint">{root ? t('האפליקציה נתקלה בתקלה לא צפויה. אפשר לנסות שוב, ואם זה חוזר, לרענן את האפליקציה.') : t('המסך הזה נתקל בתקלה. שאר האפליקציה ממשיכה לעבוד, אפשר לעבור ללשונית אחרת.')}</p>
        <div className="err-actions">
          <button className="primary" type="button" onClick={this.retry}>{t('נסו שוב')}</button>
          <button className="ghost" type="button" onClick={() => location.reload()}>{t('רענון האפליקציה')}</button>
        </div>
      </div>
    );
  }
}
