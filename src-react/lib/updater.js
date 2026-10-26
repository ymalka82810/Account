// Self-update for a sideloaded Capacitor APK, published as a GitHub release asset.
// Talks to the native AppUpdater plugin (AppUpdaterPlugin.java) through the injected bridge,
// so it works without bundling @capacitor/core.
// הקוד מבוסס על מנגנון העדכון של פרויקט Reader (resources/android-updater + src/lib/updater.ts).

const cap = window.Capacitor;
const call = (method, options) => cap.nativePromise('AppUpdater', method, options);

export const isNativeApp = !!cap?.isNativePlatform?.();

// {versionCode, versionName} of the installed APK
export const appInfo = () => call('appInfo');

const CACHE_KEY = 'updater-releases';

// Anonymous GitHub API calls are limited to 60/hour per IP. Revalidating with the stored ETag
// answers 304, which doesn't count against the limit, and the cached list is used if we're limited anyway.
async function fetchReleases(repo) {
  let cached;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (c?.repo === repo) cached = c;
  } catch { /* no usable cache */ }
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: cached ? { 'If-None-Match': cached.etag } : {},
    cache: 'no-store',
  });
  if (res.status === 304 && cached) return cached.releases;
  if (!res.ok) {
    if (cached && (res.status === 403 || res.status === 429)) return cached.releases;
    throw new Error(`HTTP ${res.status}`);
  }
  const releases = await res.json();
  const etag = res.headers.get('ETag');
  if (etag) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ repo, etag, releases })); } catch { /* storage full or blocked */ }
  }
  return releases;
}

// The newest release in `repo` whose tag starts with `tag` + a digit, if its versionCode (written in the
// release notes by the build; the tag's trailing number is the fallback) is newer than the installed APK.
// The release must carry an .apk asset. Returns {version, url, sha256?} or null.
export async function findUpdate(repo, tag) {
  const { versionCode } = await appInfo();
  const ours = new RegExp(`^${tag}\\d`);
  const release = (await fetchReleases(repo)).find((r) => !r.draft && !r.prerelease && ours.test(r.tag_name));
  if (!release) return null;
  const body = release.body ?? '';
  const latest = Number(/^versionCode:\s*(\d+)/m.exec(body)?.[1] ?? /(\d+)$/.exec(release.tag_name)?.[1] ?? 0);
  const sha256 = /^sha256:\s*([0-9a-f]{64})\s*$/im.exec(body)?.[1]?.toLowerCase();
  const apk = release.assets.find((a) => a.name.endsWith('.apk'));
  if (latest <= versionCode || !apk) return null;
  return { version: release.tag_name.slice(tag.length), url: apk.browser_download_url, sha256 };
}

// Downloads the APK (straight from the app at full speed, with the system DownloadManager as a fallback),
// checks its SHA-256 (when given) and opens the system install dialog once the app is in the foreground.
// onProgress gets 0–100 (-1 if the size is unknown).
// Rejects with an Error whose message is "busy", "bad url", "download", "checksum", "not an update",
// "permission" or "no installer".
export async function installUpdate(url, sha256, onProgress) {
  const listener = onProgress && cap.addListener('AppUpdater', 'progress', (e) => onProgress(e.percent));
  try {
    await call('downloadAndInstall', { url, sha256 });
  } finally {
    listener?.remove();
  }
}

// הודעה בעברית לפי קוד השגיאה של הפלאגין.
export function updateErrorText(e) {
  const code = e instanceof Error ? e.message : String(e || '');
  if (code.includes('permission')) return 'צריך לאפשר לאפליקציה להתקין עדכונים: בהגדרות שמופיעות, מפעילים "אפשר מהמקור הזה" וחוזרים ללחוץ "עדכן"';
  if (code.includes('no installer')) return 'לא נמצאה בטלפון תוכנת התקנה. אפשר להוריד את הקובץ ישירות מ-GitHub';
  if (code.includes('checksum')) return 'הקובץ שירד לא תקין. נסו שוב';
  if (code.includes('not an update')) return 'הקובץ שירד אינו גרסה חדשה של האפליקציה';
  if (code.includes('busy')) return 'עדכון כבר מתבצע';
  return 'ההורדה נכשלה. בדקו חיבור לאינטרנט ונסו שוב';
}
