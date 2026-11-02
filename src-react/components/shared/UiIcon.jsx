// אייקון תלת-ממדי שרונדר ב-Blender (scripts/blender/icons.py -> public/ui/<name>.webp), במקום אימוג'י.
/** @param {{ name: 'fly-money' | 'handshake' }} props */
export default function UiIcon({ name }) {
  return <img className="ui-icon" src={`ui/${name}.webp`} alt="" width="48" height="48" draggable="false" aria-hidden="true" />;
}
