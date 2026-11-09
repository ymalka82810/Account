import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { api, server } from './tests/helpers/generatedStubs.js';

// בבדיקות של convex-test אין convex/_generated (לא ב-git), אז מספקים תחליף מינימלי.
const convexGeneratedStub = {
  name: 'convex-generated-stub',
  enforce: 'pre',
  resolveId(id) {
    const m = /_generated\/(server|api)$/.exec(id);
    if (m) return 'virtual:convex-stub-' + m[1];
  },
  load(id) {
    if (id === 'virtual:convex-stub-server') return server;
    if (id === 'virtual:convex-stub-api') return api;
  },
};

// בפריסה ל-GitHub Pages הכתובת היא ymalka82810.github.io/Account/,
// אז כל הנתיבים היחסיים (JS, CSS, קבצים) צריכים את התחילית הזו.
// בפיתוח מקומי (npm run dev) זה נשאר '/'.
// מזהה הבנייה שמוצג באתר ב"החשבון שלי" > גרסה: תאריך הבנייה ו-7 התווים הראשונים של הקומיט.
// (באפליקציה מוצג versionName של ה-APK.)
const commit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD').toString().trim(); } catch { return 'dev'; }
})();
const APP_BUILD = `${new Date().toISOString().slice(0, 10)} · ${commit}`;

export default defineConfig(({ command }) => ({
  plugins: [convexGeneratedStub],
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
  // vitest מריץ רק את tests/. בדיקות הדפדפן ב-e2e/ רצות ב-Playwright (npm run e2e).
  test: { include: ['tests/**/*.test.ts'], server: { deps: { inline: ['convex-test'] } } },
  // JSX runtime שעוטף כל אימוג'י ב-<span class="emo"> בשביל אפקט הנפח (src-react/lib/emojiJsx.js)
  oxc: { jsx: { importSource: 'emoji-jsx' } },
  resolve: {
    alias: {
      'emoji-jsx/jsx-runtime': fileURLToPath(new URL('./src-react/lib/emojiJsx.js', import.meta.url)),
      'emoji-jsx/jsx-dev-runtime': fileURLToPath(new URL('./src-react/lib/emojiJsxDev.js', import.meta.url)),
    },
  },
  // בבניית APK (APK_BUILD=1) הקבצים נטענים מתוך האפליקציה, אז נתיב יחסי.
  base: process.env.APK_BUILD ? './' : command === 'build' ? '/Account/' : '/',
  build: {
    outDir: 'dist',
  },
}));
