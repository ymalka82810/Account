import { PARENT_PIN_MAX } from '../../lib/pin.js';
import { t } from '../../i18n/index.js';
import { useState } from 'react';
import Reveal from './Reveal.jsx';

// placeholder הוא getter כדי שהתרגום ייקרא בכל פעם שהאובייקט נפרס (שפה יכולה להתחלף).
export const codeProps = { type: 'text', inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code', get placeholder() { return t('6 ספרות'); }, dir: 'ltr' };
// max: אורך הקוד המרבי בשדה. שדה של קוד קיים (current-password) צריך להתאים גם להורה עם קוד ארוך.
export const pinProps = (ac, max) => ({ type: 'password', inputMode: 'numeric', maxLength: max ?? (ac === 'current-password' ? PARENT_PIN_MAX : 4), autoComplete: ac });
export const Err = ({ children }) => <Reveal show appear><p className="error" role="alert">{children}</p></Reveal>;
export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;

// שדה קוד סודי עם כפתור עין בקצה השורה (כמו במחשב): לחיצה מציגה את הספרות ולחיצה נוספת מסתירה.
// הכפתור לא לוקח פוקוס כשהמקלדת של האפליקציה פתוחה (ראו onMouseDown ב-AppKeyboard), אז היא נשארת למעלה.
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-toggle" aria-label={show ? t('הסתרת הקוד') : t('הצגת הקוד')} aria-pressed={show} onClick={() => setShow((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
