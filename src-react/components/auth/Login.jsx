import { useState } from 'react';
import { state } from '../../state/state.js';
import { goView, leaveFamily, startPin } from '../../state/auth.js';
import { In, Terms, AvatarPicker, randomAvatar, Tile, useBusy } from './parts.jsx';

export default function Login({ current }) {
  const fam = state.fam;
  return (
    <In screen="login" current={current}>
      <button className="ghost back" type="button" onClick={leaveFamily}>→ משפחה אחרת</button>
      <div className="big-emoji" aria-hidden="true">🪙</div>
      <h1>{fam ? fam.name : 'הקופה המשפחתית'}</h1>
      <p className="hint">מי נכנס/ת?</p>
      <div className="tiles">
        {fam && fam.people.map((p) => <Tile key={p.id} avatar={p.avatar} name={p.name} onClick={() => startPin(p, false)} />)}
        <Tile avatar="➕" name="אני חדש/ה" onClick={() => goView('join')} />
      </div>
    </In>
  );
}
