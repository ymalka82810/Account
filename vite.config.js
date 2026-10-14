import { defineConfig } from 'vite';

// בפריסה ל-GitHub Pages הכתובת היא ymalka82810.github.io/Account/,
// אז כל הנתיבים היחסיים (JS, CSS, קבצים) צריכים את התחילית הזו.
// בפיתוח מקומי (npm run dev) זה נשאר '/'.
export default defineConfig(({ command }) => ({
  // בבניית APK (APK_BUILD=1) הקבצים נטענים מתוך האפליקציה, אז נתיב יחסי.
  base: process.env.APK_BUILD ? './' : command === 'build' ? '/Account/' : '/',
  build: {
    outDir: 'dist',
  },
}));
