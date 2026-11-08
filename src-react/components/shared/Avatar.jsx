import { useState } from 'react';
import { AVATARS, PARENT_AVATARS } from '../../state/state.js';

// תמונות הפלסטלינה של הדמויות (public/avatars/<key>.webp, מ-scripts/blender/avatars.py).
// ערך שאינו ברשימה (דמות ישנה, ברירת המחדל, סימן ➕) נשאר אימוג'י רגיל.
const KNOWN = new Set([...AVATARS, ...PARENT_AVATARS]);

/** שם הקובץ של דמות: הקודים בהקסה מופרדים ב-'-', בלי FE0F (כמו key_of ב-scripts/blender/avatars_prep.py). */
const avatarKey = (/** @type {string} */ a) => Array.from(a, (c) => /** @type {number} */ (c.codePointAt(0))).filter((c) => c !== 0xfe0f).map((c) => c.toString(16)).join('-');

/**
 * @param {{ value: string, className?: string, as?: 'span' | 'div' }} props
 */
export default function Avatar({ value, className, as: Tag = 'span' }) {
  // תמונה שלא נטענה (קובץ חסר, חסימה, רשת) לא משאירה ריבוע ריק: מציגים את האימוג'י במקומה
  const [failed, setFailed] = useState('');
  return (
    <Tag className={className} aria-hidden="true">
      {KNOWN.has(value) && failed !== value
        ? <img className="avatar-img" src={`avatars/${avatarKey(value)}.webp`} alt="" draggable={false} decoding="async" onError={() => setFailed(value)} />
        : value}
    </Tag>
  );
}
