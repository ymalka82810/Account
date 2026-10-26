import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
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
export default defineConfig(({ command }) => ({
  plugins: [convexGeneratedStub],
  test: { server: { deps: { inline: ['convex-test'] } } },
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
