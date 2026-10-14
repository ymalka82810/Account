import { AVATARS } from '../../state/state.js';

export const randomAvatar = (options = AVATARS) => options[Math.floor(Math.random() * options.length)];

export default function AvatarPicker({ value, onChange, options = AVATARS }) {
  return (
    <div className="avatars">
      {options.map((a) => (
        <button key={a} type="button" className={'av' + (a === value ? ' on' : '')} aria-label={'דמות ' + a}
          aria-pressed={a === value} onClick={() => onChange(a)}>{a}</button>
      ))}
    </div>
  );
}
