import { useState } from 'react';
import { t } from '../../i18n/index.js';

// כפתור שנועל את עצמו ומראה "⏳ רגע…" עד שהפעולה האסינכרונית מסתיימת.
export default function AsyncButton({ onClick, children, className, type = 'button', ...rest }) {
  const [busy, setBusy] = useState(false);
  async function handle(ev) {
    if (busy) return;
    setBusy(true);
    try { await onClick(ev); } finally { setBusy(false); }
  }
  return (
    <button {...rest} type={type} className={className + (busy ? ' busy' : '')} disabled={busy} aria-busy={busy || undefined} onClick={handle}>
      {busy ? t('⏳ רגע…') : children}
    </button>
  );
}
