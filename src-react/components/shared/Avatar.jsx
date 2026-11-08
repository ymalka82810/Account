import { useEffect, useState } from 'react';
import { avatarReady, avatarUrl, loadAvatar } from '../../lib/avatars.js';

/**
 * דמות פלסטלינה (public/avatars). עד שהתמונה נטענה, ואם נכשלה, מוצג האימוג'י ולא ריבוע ריק.
 * @param {{ value: string, className?: string, as?: 'span' | 'div' }} props
 */
export default function Avatar({ value, className, as: Tag = 'span' }) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!avatarUrl(value) || avatarReady(value)) return undefined;
    let alive = true;
    loadAvatar(value).then((ok) => { if (alive && ok) rerender((n) => n + 1); });
    return () => { alive = false; };
  }, [value]);
  return (
    <Tag className={className} aria-hidden="true">
      {avatarReady(value)
        ? <img className="avatar-img" src={avatarUrl(value) || ''} alt="" draggable={false} decoding="async" />
        : value}
    </Tag>
  );
}
