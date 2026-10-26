import { useEffect, useState } from 'react';
import { isNativeApp, findUpdate, installUpdate, updateErrorText } from '../../lib/updater.js';

const REPO = 'ymalka82810/Account';

// באפליקציית האנדרואיד: בודק ב-GitHub Releases אם יש גרסה חדשה ומציע לעדכן. באתר הרגיל לא מציג כלום.
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [percent, setPercent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNativeApp) findUpdate(REPO, 'v').then(setUpdate).catch(() => {});
  }, []);

  if (!update) return null;

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
    <div className="update-banner" role="status">
      <span>
        {error || (percent === null ? `גרסה חדשה זמינה (${update.version})` : percent < 0 ? 'מוריד עדכון...' : `מוריד עדכון... ${percent}%`)}
      </span>
      {percent === null && <button type="button" onClick={run}>{error ? 'נסה שוב' : 'עדכן'}</button>}
    </div>
  );
}
