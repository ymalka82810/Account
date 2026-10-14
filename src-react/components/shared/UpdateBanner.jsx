import { useEffect, useState } from 'react';
import { isNativeApp, findUpdate, installUpdate } from '../../lib/updater.js';

const REPO = 'ymalka82810/Account';

// באפליקציית האנדרואיד: בודק ב-GitHub Releases אם יש גרסה חדשה ומציע לעדכן. באתר הרגיל לא מציג כלום.
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [percent, setPercent] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isNativeApp) findUpdate(REPO, 'v').then(setUpdate).catch(() => {});
  }, []);

  if (!update) return null;

  const run = async () => {
    setError(false);
    setPercent(0);
    try {
      await installUpdate(update.url, setPercent);
    } catch {
      setError(true);
    }
    setPercent(null);
  };

  return (
    <div className="update-banner" role="status">
      <span>
        {error ? 'העדכון נכשל, נסו שוב' : percent === null ? `גרסה חדשה זמינה (${update.version})` : percent < 0 ? 'מוריד עדכון...' : `מוריד עדכון... ${percent}%`}
      </span>
      {percent === null && <button type="button" onClick={run}>{error ? 'נסה שוב' : 'עדכן'}</button>}
    </div>
  );
}
