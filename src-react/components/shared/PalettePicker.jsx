import { t } from '../../i18n/index.js';

// צבעי הניאון של הנוער: שלוש פלטות, אותו מקור לשמות בפנקס האישי וב"החשבון שלי" (גם התרגום).
// הצבעים עצמם ב-style.css (.palette-pick[data-pal]) ובמשתני --neon-a/--neon-b של ערכת הנוער.
// פונקציה ולא קבוע: התרגום נקרא בזמן הרינדור, בשפה הנוכחית.
export const palettes = () => [
  { id: 'blue', label: t('כחול + סגול') },
  { id: 'green', label: t('ירוק + צהוב') },
  { id: 'orange', label: t('כתום + ורוד') },
];

export default function PalettePicker({ value, onPick, label }) {
  return (
    <div className="palette-picks" role="radiogroup" aria-label={label}>
      {palettes().map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id}
          className={'palette-pick' + (value === p.id ? ' sel' : '')} data-pal={p.id}
          onClick={() => onPick(p.id)}>
          <span className="palette-swatch" aria-hidden="true" />
          {p.label}
        </button>
      ))}
    </div>
  );
}
