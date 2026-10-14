import { AVATARS } from '../../src/state.js';

export const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="avatars">
      {AVATARS.map((a) => (
        <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
          aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
      ))}
    </div>
  );
}
