// בדיקות קצה לקצה (E2E): דפדפן אמיתי שלוחץ על כפתורים באתר, בגודל של טלפון.
// הרצה: npm run e2e  (בפעם הראשונה במחשב: npx playwright install chromium)
// CHROMIUM_PATH: נתיב לדפדפן Chromium קיים במקום זה של Playwright (לסביבות בלי הורדה).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const chromiumPath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    ...devices['Pixel 7'],
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromiumPath
      ? { executablePath: chromiumPath, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--in-process-gpu', '--use-angle=swiftshader'] }
      : {},
  },
  projects: [{ name: 'mobile-chromium' }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
