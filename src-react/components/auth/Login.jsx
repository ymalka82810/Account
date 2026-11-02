import Arrow from '../shared/Arrow.jsx';
import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { goView, leaveToWelcome, startPin, openNotebook, otherFamilies } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';
import UiIcon from '../shared/UiIcon.jsx';

export default function Login({ current }) {
  const fam = state.fam;
  // כפתור "משפחה אחרת" קיים רק אם המכשיר מכיר באמת עוד משפחה (משפחות נוספות נפתחות מאזור ההורה).
  const hasOther = !!fam && otherFamilies(fam.familyId).length > 0;
  return (
    <In screen="login" current={current}>
      {hasOther && <button className="ghost back" type="button" onClick={leaveToWelcome}><Arrow kind="back" /> {t('משפחה אחרת')}</button>}
      <button className="ghost back end" type="button" onClick={openNotebook}><UiIcon name="notebook" inline /> {t('הפנקס שלי')}</button>
      <img className="big-coin" src="coin.webp" alt="" width="68" height="68" draggable="false" />
      <h1>{fam ? fam.name : t('הקופה המשפחתית')}</h1>
      <p className="hint">{t('מי נכנס/ת?')}</p>
      <div className="tiles">
        {fam && fam.people.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, false)} />)}
        <Tile avatar="➕" name={t('אני חדש/ה')} onClick={() => goView('join')} />
      </div>
    </In>
  );
}
