import { Fragment } from 'react';
import { uiIconUrl } from '../../lib/uiIcons.js';

// אייקונים תלת-ממדיים שרונדרו ב-Blender (scripts/blender/icons.py -> public/ui/<name>.webp), במקום אימוג'י.
/** @typedef {'fly-money' | 'handshake' | 'money-bag' | 'scroll' | 'notebook' | 'family' | 'gear' | 'check' | 'trash' | 'bell' | 'bell-off' | 'key' | 'phone' | 'mail' | 'plus' | 'home' | 'person' | 'palette' | 'eye'} UiIconName */

// המפתחות בלי U+FE0F (בורר האימוג'י); ההתאמה בטקסט סלחנית אליו, כך ש-"⚙" ו-"⚙️" שניהם מוחלפים.
/** @type {Record<string, UiIconName>} */
const BY_EMOJI = {
  '💸': 'fly-money', '🤝': 'handshake', '💰': 'money-bag', '📜': 'scroll', '📒': 'notebook', '👨‍👩‍👧': 'family',
  '⚙': 'gear', '✅': 'check', '🗑': 'trash', '🔔': 'bell', '🔕': 'bell-off', '🔑': 'key', '📱': 'phone', '✉': 'mail',
  '➕': 'plus', '🏠': 'home', '🙂': 'person', '🎨': 'palette', '👁': 'eye',
};
const EMOJI_RE = new RegExp(`(${Object.keys(BY_EMOJI).map((e) => `${e}\\uFE0F?`).join('|')})`, 'u');

/** @param {{ name: UiIconName, inline?: boolean }} props */
export default function UiIcon({ name, inline = false }) {
  return <img className={inline ? 'ui-icon inline' : 'ui-icon'} src={uiIconUrl(name)} alt="" width="48" height="48" draggable="false" aria-hidden="true" />;
}

/**
 * מחליף אימוג'י מוכרים בתוך טקסט (גם מתורגם) באייקון Blender מוטבע, בלי לגעת במחרוזות התרגום.
 * @param {string} text
 */
export function withIcons(text) {
  return text.split(EMOJI_RE).map((part, i) => {
    const name = BY_EMOJI[part.replace(/️/g, '')];
    return name ? <UiIcon key={i} name={name} inline /> : <Fragment key={i}>{part}</Fragment>;
  });
}
