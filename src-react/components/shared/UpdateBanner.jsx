import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss.js';
import { isNativeApp, findUpdate, installUpdate, updateErrorText } from '../../lib/updater.js';

const REPO = 'ymalka82810/Account';

// באפליקציית האנדרואיד: בודק ב-GitHub Releases אם יש גרסה חדשה ומציע לעדכן. באתר הרגיל לא מציג כלום.
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [percent, setPercent] = useState(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  // לא נסגר באמצע הורדה; ההחלקה פעילה רק כשאין הורדה בתהליך
  const swipe = useSwipeDismiss(() => setHidden(true));

  useEffect(() => {
    if (isNativeApp) findUpdate(REPO, 'v').then(setUpdate).catch(() => {});
  }, []);

  if (!update || hidden) return null;

  const run = async () => {
    setError('');
    setPercent(0);
    try {
      await installUpdate(update.url, update.sha256, setPercent);
    } catch (e) {
      setError(updateErrorText(e));
    }
    setPercent(null);
  };

  return (
    <div className="update-banner" role="status" {...(percent === null ? swipe : {})}>
      <span>
        {error || (percent === null ? t('גרסה חדשה זמינה ({version})', { version: update.version }) : percent < 0 ? t('מוריד עדכון...') : t('מוריד עדכון... {percent}%', { percent }))}
      </span>
      {percent === null && <button type="button" onClick={run}>{error ? t('נסה שוב') : t('עדכן')}</button>}
    </div>
  );
}
