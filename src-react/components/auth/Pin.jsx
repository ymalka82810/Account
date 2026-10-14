import { useState } from 'react';
import { state } from '../../state/state.js';
import { pinBack, pressKey } from '../../state/auth.js';
import { useSheet } from '../shared/Sheet.jsx';
import { ForgotPinSheet } from './ForgotPinSheet.jsx';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function Pin({ current }) {
  const sheet = useSheet();
  const f = state.pinFlow;
  if (!f) return <In screen="pin" current={current} />;
  const title = f.mode === 'login'
    ? 'כתבו את הקוד הסודי'
    : f.first ? 'כתבו את הקוד שוב, לאישור' : 'בחרו קוד סודי חדש (4 ספרות)';
  return (
    <In screen="pin" current={current}>
      <button className="ghost back" type="button" onClick={pinBack}>→ חזרה</button>
      {f.person.avatar && <div className="avatar-xl" aria-hidden="true">{f.person.avatar}</div>}
      <h1>{f.person.name}</h1>
      <p className="hint">{title}</p>
      {/* key לפי מספר הרעידות: מרנדר מחדש את האלמנט ומפעיל שוב את האנימציה */}
      <div key={f.shakes} className={'dots' + (f.busy ? ' busy' : '') + (f.shakes ? ' shake' : '')} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={'dot' + (i < f.entered.length ? ' on' : '')} />)}
      </div>
      <p className="error" role="alert" aria-live="assertive">{f.busy ? 'בודקים…' : f.error}</p>
      <div className="pad">
        {KEYS.map((k, i) => (k === '' ? <span key={i} /> : (
          <button key={k} type="button" className={'key' + (k === 'del' ? ' del' : '')}
            aria-label={k === 'del' ? 'מחיקה' : k} onClick={() => pressKey(k)}>{k === 'del' ? '⌫' : k}</button>
        )))}
      </div>
      {f.mode === 'login' && f.person.role === 'parent' && !f.legacy && (
        <button className="ghost linkish" type="button" onClick={() => sheet.open('שכחתי את הקוד', <ForgotPinSheet />)}>שכחתי את הקוד</button>
      )}
    </In>
  );
}
