import { defineConfig } from 'vite';

// בפריסה ל-GitHub Pages הכתובת היא ymalka82810.github.io/Account/,
// אז כל הנתיבים היחסיים (JS, CSS, קבצים) צריכים את התחילית הזו.
// בפיתוח מקומי (npm run dev) זה נשאר '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Account/' : '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // index.html הוא עדיין האתר ה"ישן" (vanilla) החי בפרודקשן.
      // בשלב הזה ה-build בודק רק את ה-scaffold המבודד של React.
      input: 'react-app.html',
    },
  },
}));
