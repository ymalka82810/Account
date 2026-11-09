import Arrow from '../shared/Arrow.jsx';
import { useState, useEffect } from 'react';
import { t, LANGUAGES } from '../../i18n/index.js';
import { state, CODE_KEY, TOKEN_KEY } from '../../state/state.js';
import { prettyCode } from '../../lib/helpers.js';
import { submitFamilyCode, goView, startPin, openNotebook, startDemo, goToFamily, otherFamilies, deviceHasFamily } from '../../state/auth.js';
import LanguagePicker from '../shared/LanguagePicker.jsx';
import { useSheet } from '../shared/Sheet.jsx';
import { useLang } from '../../i18n/useLang.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';
import { withIcons } from '../shared/UiIcon.jsx';
import { JoinPendingChip } from './JoinWait.jsx';
import { getJoinPending } from '../../lib/joinPending.js';

// קוד בכתובת (?code=...) או כרטיס/טוקן שמורים במכשיר: מי שמגיע עם קוד לא צריך לחפש איפה מקלידים אותו.
const urlCode = () => { try { return new URLSearchParams(location.search).get('code') || ''; } catch (e) { return ''; } };
const hasSavedCode = () => { try { return !!(localStorage.getItem(CODE_KEY) || localStorage.getItem(TOKEN_KEY)); } catch (e) { return false; } };

export default function Welcome({ current }) {
  const [invite] = useState(urlCode);
  const [code, setCode] = useState(() => prettyCode(invite));
  const [open] = useState(() => !!invite || hasSavedCode());
  const joinPending = getJoinPending();
  // הקוד הוא סוד הצטרפות: אחרי הקריאה מוחקים אותו מהכתובת (היסטוריה, referrer).
  useEffect(() => {
    if (invite) history.replaceState(null, '', location.pathname + location.hash);
  }, [invite]);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const sheet = useSheet();
  const lang = useLang();
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
        <img className="big-coin" src="coin.webp" alt="" width="68" height="68" draggable="false" />
        <h1>{t('הקופה המשפחתית')}</h1>
        {!invite && (
          <div className="welcome-actions">
            <button className="primary" type="button" onClick={openNotebook}>{withIcons(t('📒 הפנקס שלי'))}</button>
            <button className="ghost" type="button" onClick={startDemo}>{t('👀 דמו של 10 שניות')}</button>
          </div>
        )}
        {joinPending && <JoinPendingChip pending={joinPending} />}
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
        {otherFamilies().map((f) => (
          <button key={f.familyId} className="ghost" type="button"
            onClick={async () => { const err = await goToFamily(f); if (err) setError(err); }}>
            <Arrow kind="return" /> {t('חזרה למשפחת {family}', { family: f.name })}
          </button>
        ))}
        {parents.length > 0 && (
          <div className="card notice">
            <p><strong>{t('כבר משתמשים בקופה?')}</strong> {t('הורה נכנס כאן, ואז מקבלים קודים לשאר המשפחה.')}</p>
            <div className="tiles">
              {parents.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, true)} />)}
            </div>
          </div>
        )}
        {!deviceHasFamily() && (
          <button className="ghost linkish" type="button" onClick={() => { state.fromNotebook = false; goView('setup'); }}>{t('👨‍👩‍👧 אני הורה ורוצה להקים קופה חדשה')}</button>
        )}
        <p className="legal"><a href="terms.html">{t('תנאי שימוש')}</a> · <a href="privacy.html">{t('מדיניות פרטיות')}</a></p>
        {/* אותו רכיב שפה כמו ב"החשבון שלי" ובהגדרות הפנקס, כקישור קטן במקום בורר קבוע במסך */}
        <button className="ghost small" type="button" onClick={() => sheet.open(t('שפה'), <div className="form"><LanguagePicker /></div>)}>{t('שפה')}: {LANGUAGES[lang].name}</button>
      </div>
    </In>
  );
}
