import { useState } from 'react';
import { g } from '../../lib/gender.js';
import { t } from '../../i18n/index.js';

// החלקים המשותפים למסכי הכניסה.
// כולם תמיד ב-DOM, ורק זה שהוא ה-current מקבל את ה-class 'active'.
const CENTER = { login: true, pin: true };
export function In({ screen, current, children }) {
  return (
    <section id={'screen-' + screen} className={'screen' + (CENTER[screen] ? ' center' : '') + (current === screen ? ' active' : '')}>
      {children}
    </section>
  );
}

export const Terms = ({ extra, gender }) => (
  <span>
    {g(gender, 'קראתי ואני מסכים ל{terms} ול{privacy}', 'קראתי ואני מסכימה ל{terms} ול{privacy}', 'קראתי ואני מסכים/ה ל{terms} ול{privacy}')
      .split(/(\{terms\}|\{privacy\})/)
      .map((part, i) => (part === '{terms}'
        ? <a key={i} href="terms.html" target="_blank" rel="noopener">{t('תנאי השימוש')}</a>
        : part === '{privacy}'
          ? <a key={i} href="privacy.html" target="_blank" rel="noopener">{t('מדיניות הפרטיות')}</a>
          : part))}{extra}
  </span>
);

export { default as AvatarPicker, randomAvatar } from '../shared/AvatarPicker.jsx';

export function Tile({ avatar, name, onClick }) {
  return (
    <button className="tile" type="button" onClick={onClick}>
      {avatar && <span className="avatar-lg" aria-hidden="true">{avatar}</span>}
      <span className="tname">{name}</span>
    </button>
  );
}

// כפתור שנועל את עצמו בזמן פעולה אסינכרונית (כמו withBusy).
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  return [busy, run];
}
