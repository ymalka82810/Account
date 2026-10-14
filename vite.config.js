import { defineConfig } from 'vite';

// בפריסה ל-GitHub Pages הכתובת היא ymalka82810.github.io/Account/,
// אז כל הנתיבים היחסיים (JS, CSS, קבצים) צריכים את התחילית הזו.
// בפיתוח מקומי (npm run dev) זה נשאר '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Account/' : '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // index.html הוא עכשיו האתר האמיתי (כולל מסך הבית ב-React).
      // react-app.html נשאר ככלי דיבאג מבודד, לא חובה אבל לא מזיק.
      input: ['index.html', 'react-app.html'],
    },
  },
}));
