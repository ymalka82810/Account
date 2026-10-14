import { useState } from 'react';
import { AVATARS } from '../../../src/state.js';

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

export const Terms = ({ extra }) => (
  <span>
    קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a> ול<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a>{extra}
  </span>
);

export function AvatarPicker({ value, onChange }) {
  return (
    <div className="avatars">
      {AVATARS.map((a) => (
        <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
          aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
      ))}
    </div>
  );
}

export const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

export function Tile({ avatar, name, onClick }) {
  return (
    <button className="tile" type="button" onClick={onClick}>
      <span className="avatar-lg" aria-hidden="true">{avatar}</span>
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
