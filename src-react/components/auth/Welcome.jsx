import { useState } from 'react';
import { state } from '../../state/state.js';
import { prettyCode } from '../../lib/helpers.js';
import { submitFamilyCode, goView, startPin, openNotebook } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

export default function Welcome({ current }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const parents = state.legacyPeople || [];
  const submit = (ev) => {
    ev.preventDefault();
    setError('');
    run(async () => {
      const err = await submitFamilyCode(code);
      if (err) setError(err); else setCode('');
    });
  };
  return (
    <In screen="welcome" current={current}>
      <div className="card-narrow">
        <div className="big-emoji" aria-hidden="true">🪙</div>
        <h1>הקופה המשפחתית</h1>
        <p className="hint">יש לכם קוד משפחה? כתבו אותו כאן. בקשו מההורים את קוד ההצטרפות של המשפחה.</p>
        <form className="form" autoComplete="off" onSubmit={submit}>
          <label className="field"><span>קוד משפחה</span>
            <input className="code-input" type="text" dir="ltr" maxLength={14} autoCapitalize="characters"
              autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="XXXXX-XXXXX" required
              value={code} onChange={(e) => { setCode(prettyCode(e.target.value)); setError(''); }} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? '⏳ רגע…' : 'כניסה'}</button>
        </form>
        {parents.length > 0 && (
          <div className="card notice">
            <p><strong>כבר משתמשים בקופה?</strong> הורה נכנס כאן, ואז מקבלים קודים לשאר המשפחה.</p>
            <div className="tiles">
              {parents.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, true)} />)}
            </div>
          </div>
        )}
        <button className="ghost linkish" type="button" onClick={openNotebook}>📒 הפנקס שלי</button>
        <button className="ghost linkish" type="button" onClick={() => goView('setup')}>👨‍👩‍👧 אני הורה ורוצה להקים קופה חדשה</button>
        <p className="legal"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a></p>
      </div>
    </In>
  );
}
