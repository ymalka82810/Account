import { defineConfig } from 'vite';

// בפריסה ל-GitHub Pages הכתובת היא ymalka82810.github.io/Account/,
// אז כל הנתיבים היחסיים (JS, CSS, קבצים) צריכים את התחילית הזו.
// בפיתוח מקומי (npm run dev) זה נשאר '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Account/' : '/',
  build: {
    outDir: 'dist',
  },
}));
