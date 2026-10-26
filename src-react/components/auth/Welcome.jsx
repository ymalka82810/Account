import { useState, useEffect } from 'react';
import { t } from '../../i18n/index.js';
import { state, CODE_KEY, TOKEN_KEY } from '../../state/state.js';
import { prettyCode } from '../../lib/helpers.js';
import { submitFamilyCode, goView, startPin, openNotebook, startDemo } from '../../state/auth.js';
import LanguagePicker from '../shared/LanguagePicker.jsx';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

// קוד בכתובת (?code=...) או כרטיס/טוקן שמורים במכשיר: מי שמגיע עם קוד לא צריך לחפש איפה מקלידים אותו.
const urlCode = () => { try { return new URLSearchParams(location.search).get('code') || ''; } catch (e) { return ''; } };
const hasSavedCode = () => { try { return !!(localStorage.getItem(CODE_KEY) || localStorage.getItem(TOKEN_KEY)); } catch (e) { return false; } };

export default function Welcome({ current }) {
  const [invite] = useState(urlCode);
  const [code, setCode] = useState(() => prettyCode(invite));
  const [open] = useState(() => !!invite || hasSavedCode());
  // הקוד הוא סוד הצטרפות: אחרי הקריאה מוחקים אותו מהכתובת (היסטוריה, referrer).
  useEffect(() => {
    if (invite) history.replaceState(null, '', location.pathname + location.hash);
  }, [invite]);
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
        <h1>{t('הקופה המשפחתית')}</h1>
        {!invite && (
          <div className="welcome-actions">
            <button className="primary" type="button" onClick={openNotebook}>{t('📒 הפנקס שלי')}</button>
            <button className="ghost" type="button" onClick={startDemo}>{t('👀 דמו של 10 שניות')}</button>
          </div>
        )}
        <details className="family-code" open={open || undefined}>
          <summary>{t('יש לי קוד משפחה')}</summary>
          <p className="hint">{t('יש לכם קוד משפחה? כתבו אותו כאן. בקשו מההורים את קוד ההצטרפות של המשפחה.')}</p>
          <form className="form" autoComplete="off" onSubmit={submit}>
            <label className="field"><span>{t('קוד משפחה')}</span>
              <input className="code-input" type="text" dir="ltr" maxLength={14} autoCapitalize="characters"
                autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="XXXXX-XXXXX" required
                value={code} onChange={(e) => { setCode(prettyCode(e.target.value)); setError(''); }} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? t('⏳ רגע…') : t('כניסה')}</button>
          </form>
        </details>
        {parents.length > 0 && (
          <div className="card notice">
            <p><strong>{t('כבר משתמשים בקופה?')}</strong> {t('הורה נכנס כאן, ואז מקבלים קודים לשאר המשפחה.')}</p>
            <div className="tiles">
              {parents.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, true)} />)}
            </div>
          </div>
        )}
        <button className="ghost linkish" type="button" onClick={() => { state.fromNotebook = false; goView('setup'); }}>{t('👨‍👩‍👧 אני הורה ורוצה להקים קופה חדשה')}</button>
        <p className="legal"><a href="terms.html">{t('תנאי שימוש')}</a> · <a href="privacy.html">{t('מדיניות פרטיות')}</a></p>
        <LanguagePicker />
      </div>
    </In>
  );
}
