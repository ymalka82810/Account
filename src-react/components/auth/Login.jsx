import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { goView, leaveFamily, startPin, openNotebook } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

export default function Login({ current }) {
  const fam = state.fam;
  return (
    <In screen="login" current={current}>
      <button className="ghost back" type="button" onClick={leaveFamily}>{t('→ משפחה אחרת')}</button>
      <div className="big-emoji" aria-hidden="true">🪙</div>
      <h1>{fam ? fam.name : t('הקופה המשפחתית')}</h1>
      <p className="hint">{t('מי נכנס/ת?')}</p>
      <div className="tiles">
        {fam && fam.people.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, false)} />)}
        <Tile avatar="➕" name={t('אני חדש/ה')} onClick={() => goView('join')} />
        <Tile avatar="📒" name={t('הפנקס שלי')} onClick={openNotebook} />
      </div>
    </In>
  );
}
