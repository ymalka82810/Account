import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { soundOn, setSound, vibrateOn, setVibrate, motionMode, setMotion } from '../../lib/feel.js';
import { playKeyClick } from '../../lib/keyClick.js';

// מתג עם מצב גלוי (מופעל / כבוי) ולא רק צבע: role="switch" וגם טקסט.
function Switch({ label, on, onToggle }) {
  return (
    <button className="acct-row acct-switch" type="button" role="switch" aria-checked={on} onClick={onToggle}>
      <span>{label}</span>
      <span className="acct-state">{on ? t('מופעל') : t('כבוי')}<span className="switch-knob" aria-hidden="true" /></span>
    </button>
  );
}

// קבוצת "תחושה" ב"החשבון שלי": צליל, רטט והפחתת תנועה. הכול נשמר במכשיר בלבד (lib/feel.js).
export default function FeelSettings() {
  const [sound, setSoundState] = useState(soundOn);
  const [vibrate, setVibrateState] = useState(vibrateOn);
  const [motion, setMotionState] = useState(motionMode);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundState(next);
    if (next) playKeyClick('enter'); // שומעים מיד מה הופעל
  };
  const toggleVibrate = () => {
    const next = !vibrate;
    setVibrate(next);
    setVibrateState(next);
    if (next) { try { navigator.vibrate(30); } catch (e) { /* אין רטט במכשיר */ } }
  };
  const pickMotion = (mode) => { setMotion(mode); setMotionState(mode); };

  const modes = [['system', t('לפי המכשיר')], ['off', t('כבוי')], ['on', t('מופעל')]];
  return (
    <>
      <Switch label={t('צליל')} on={sound} onToggle={toggleSound} />
      <Switch label={t('רטט')} on={vibrate} onToggle={toggleVibrate} />
      <div className="field acct-motion"><span>{t('הפחתת תנועה')}</span>
        <div className="nb-opts" role="radiogroup" aria-label={t('הפחתת תנועה')}>
          {modes.map(([id, text]) => (
            <button key={id} type="button" role="radio" aria-checked={motion === id}
              className={'ghost' + (motion === id ? ' active' : '')} onClick={() => pickMotion(id)}>{text}</button>
          ))}
        </div>
      </div>
    </>
  );
}
