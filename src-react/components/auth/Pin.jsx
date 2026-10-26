import { useState } from 'react';
import { state } from '../../state/state.js';
import { pinBack, pinPadSpec, pressKey } from '../../state/auth.js';
import { useSheet } from '../shared/Sheet.jsx';
import { ForgotPinSheet } from './ForgotPinSheet.jsx';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function Pin({ current }) {
  const sheet = useSheet();
  const f = state.pinFlow;
  if (!f) return <In screen="pin" current={current} />;
  const { max, auto } = pinPadSpec(f);
  const title = f.mode === 'login'
    ? 'כתבו את הקוד הסודי'
    : f.first ? 'כתבו את הקוד שוב, לאישור' : `בחרו קוד סודי חדש (${auto ? '4 ספרות' : '4 עד 8 ספרות'})`;
  // בקביעת קוד חופשית (הורה) במקום המשבצת הריקה יש כפתור ✓ ששולח.
  const keys = auto ? KEYS : KEYS.map((k) => (k === '' ? 'ok' : k));
  return (
    <In screen="pin" current={current}>
      <button className="ghost back" type="button" onClick={pinBack}>→ חזרה</button>
      {f.person.avatar && <div className="avatar-xl" aria-hidden="true">{f.person.avatar}</div>}
      <h1>{f.person.name}</h1>
      <p className="hint">{title}</p>
      {/* key לפי מספר הרעידות: מרנדר מחדש את האלמנט ומפעיל שוב את האנימציה */}
      <div key={f.shakes} className={'dots' + (f.busy ? ' busy' : '') + (f.shakes ? ' shake' : '')} aria-hidden="true">
        {Array.from({ length: auto ? max : Math.max(4, f.entered.length) }, (_, i) => <span key={i} className={'dot' + (i < f.entered.length ? ' on' : '')} />)}
      </div>
      <p className="error" role="alert" aria-live="assertive">{f.busy ? 'בודקים…' : f.error}</p>
      <div className="pad">
        {keys.map((k, i) => (k === '' ? <span key={i} /> : (
          <button key={k} type="button" className={'key' + (k === 'del' ? ' del' : '')}
            disabled={k === 'ok' && f.entered.length < 4}
            aria-label={k === 'del' ? 'מחיקה' : k === 'ok' ? 'אישור' : k} onClick={() => pressKey(k)}>{k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}</button>
        )))}
      </div>
      {f.mode === 'login' && f.person.role === 'parent' && !f.legacy && (
        <button className="ghost linkish" type="button" onClick={() => sheet.open('שכחתי את הקוד', <ForgotPinSheet />)}>שכחתי את הקוד</button>
      )}
    </In>
  );
}
