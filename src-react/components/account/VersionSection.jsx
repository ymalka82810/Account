import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { toast } from '../../lib/helpers.js';
import { isNativeApp, appInfo, findUpdate, installUpdate, updateErrorText } from '../../lib/updater.js';
import AsyncButton from '../shared/AsyncButton.jsx';

const REPO = 'ymalka82810/Account';
const BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';

// "גרסה" בתחתית "החשבון שלי": מספר הגרסה המותקנת, ובדיקת עדכון ידנית.
// באפליקציה: בודק ב-GitHub Releases ומוריד ומתקין מכאן. באתר: הדף נטען תמיד מהרשת, אז "עדכון" = טעינה מחדש.
export default function VersionSection() {
  const [version, setVersion] = useState(isNativeApp ? '' : BUILD);
  const [update, setUpdate] = useState(/** @type {any} */ (null));
  const [percent, setPercent] = useState(/** @type {number | null} */ (null));

  useEffect(() => {
    if (isNativeApp) appInfo().then((i) => setVersion(i.versionName || String(i.versionCode))).catch(() => {});
  }, []);

  async function check() {
    if (!isNativeApp) {
      try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch (e) { /* בלי service worker */ }
      location.reload();
      return;
    }
    try {
      const u = await findUpdate(REPO, 'v');
      if (u) setUpdate(u); else toast(t('יש לך את הגרסה האחרונה ✅'));
    } catch (e) { toast(t('לא הצלחנו לבדוק עדכונים. בדקו חיבור לאינטרנט ונסו שוב')); }
  }

  async function install() {
    setPercent(0);
    try { await installUpdate(update.url, update.sha256, setPercent, update.fallbackUrl); }
    catch (e) { toast(updateErrorText(e)); }
    setPercent(null);
  }

  return (
    <section className="acct-group" aria-labelledby="acct-h-version">
      <h3 className="acct-h" id="acct-h-version">{t('גרסה')}</h3>
      <div className="field"><span>{t('גרסה מותקנת')}</span><span dir="ltr" className="acct-version">{version || '…'}</span></div>
      {percent !== null ? (
        <div className="acct-row" role="status"><span>{percent < 0 ? t('מוריד עדכון...') : t('מוריד עדכון... {percent}%', { percent })}</span></div>
      ) : update ? (
        <AsyncButton className="acct-row primary" onClick={install}><span>{t('עדכון לגרסה {version}', { version: update.version })}</span></AsyncButton>
      ) : (
        <AsyncButton className="acct-row" onClick={check}><span>{isNativeApp ? t('בדיקת עדכונים') : t('טעינת הגרסה האחרונה')}</span></AsyncButton>
      )}
    </section>
  );
}
