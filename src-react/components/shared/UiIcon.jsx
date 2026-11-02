import { Fragment } from 'react';

// אייקונים תלת-ממדיים שרונדרו ב-Blender (scripts/blender/icons.py -> public/ui/<name>.webp), במקום אימוג'י.
/** @typedef {'fly-money' | 'handshake' | 'money-bag' | 'scroll' | 'notebook' | 'family'} UiIconName */

/** @type {Record<string, UiIconName>} */
const BY_EMOJI = { '💸': 'fly-money', '🤝': 'handshake', '💰': 'money-bag', '📜': 'scroll', '📒': 'notebook', '👨‍👩‍👧': 'family' };
const EMOJI_RE = new RegExp(`(${Object.keys(BY_EMOJI).join('|')})`, 'u');

/** @param {{ name: UiIconName, inline?: boolean }} props */
export default function UiIcon({ name, inline = false }) {
  return <img className={inline ? 'ui-icon inline' : 'ui-icon'} src={`ui/${name}.webp`} alt="" width="48" height="48" draggable="false" aria-hidden="true" />;
}

/**
 * מחליף אימוג'י מוכרים בתוך טקסט (גם מתורגם) באייקון Blender מוטבע, בלי לגעת במחרוזות התרגום.
 * @param {string} text
 */
export function withIcons(text) {
  return text.split(EMOJI_RE).map((part, i) => (
    BY_EMOJI[part] ? <UiIcon key={i} name={BY_EMOJI[part]} inline /> : <Fragment key={i}>{part}</Fragment>
  ));
}
