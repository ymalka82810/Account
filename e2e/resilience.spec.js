import { test, expect } from '@playwright/test';
import { addEntry, deadServer, freshDevice, openRows, serverReady } from './helpers.js';

// עמידות: שגיאת רינדור בלשונית לא מפילה את האפליקציה, שרת שלא עונה לא משאיר מסך טעינה אינסופי,
// ופתיחת "החשבון שלי" מהירה. כל הבדיקות כאן רצות מול שרת מת (deadServer): אין תעבורה לשרת אמיתי.
const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

test.beforeEach(async ({ page }) => {
  await deadServer(page);
  await page.addInitScript(() => localStorage.setItem('loadingAnimSeen', '1')); // בלי אנימציית הטעינה הראשונה
});

// מהפנקס (מכשיר חדש) דרך "צור משפחה" > "כניסה לקופה" אל מסך הפתיחה, ומשם לדמו (הורה עם ארבע לשוניות).
async function enterDemo(page) {
  await page.getByRole('button', { name: /צור משפחה/ }).click();
  await page.getByRole('button', { name: /כניסה לקופה/ }).click();
  await serverReady(page);
  await page.getByRole('button', { name: /דמו של 10 שניות/ }).click();
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 15000 });
}

test.describe('ErrorBoundary', () => {
  test('שגיאת רינדור בלשונית מציגה הסבר, והלשוניות האחרות והניווט ממשיכים לעבוד', async ({ page }) => {
    const logged = [];
    page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
    await freshDevice(page);
    await enterDemo(page);

    // ההיסטוריה קורסת בהרכבה הבאה (דגל בדיקה שקיים רק בשרת הפיתוח)
    await page.evaluate(() => { window.__kupaCrash = 'history'; });
    await page.locator('#tabbtn-history').click();
    const box = page.locator('#tab-history [role="alert"]');
    await expect(box).toBeVisible();
    await expect(box.getByRole('heading', { name: 'משהו השתבש' })).toBeVisible();
    // בלי stack בפני המשתמש, אבל כן ב-console
    await expect(box).not.toContainText(/Error|    at |CrashProbe/);
    expect(logged.some((l) => l.includes('ErrorBoundary'))).toBe(true);
    for (const b of await box.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);

    // לשונית אחרת והניווט עובדים
    await page.locator('#tabbtn-manage').click();
    await expect(page.locator('#tab-manage')).toBeVisible();
    await expect(page.locator('#tab-manage [role="alert"]')).toHaveCount(0);
    await page.locator('#tabbtn-home').click();
    await expect(page.locator('#tab-home')).toBeVisible();
    await expect(page.locator('#tab-home [role="alert"]')).toHaveCount(0);
    await expect(page.locator('nav.tabs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'החשבון שלי' })).toBeVisible();

    // "נסו שוב" מאפס את הגבול: אחרי שהתקלה נעלמה הלשונית חוזרת
    await page.evaluate(() => { window.__kupaCrash = ''; });
    await page.locator('#tabbtn-history').click();
    await box.getByRole('button', { name: 'נסו שוב' }).click();
    await expect(box).toHaveCount(0);
    await expect(page.locator('#tab-history')).toBeVisible();
  });

  test('ההסבר בשפת הממשק (אנגלית, LTR)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kupa-lang', 'en'));
    await page.goto('/');
    await page.locator('.nb-fam-btn').click();
    await page.locator('.sheet .form button.ghost').click();
    await serverReady(page);
    await page.locator('.welcome-actions .ghost').click();
    await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => { window.__kupaCrash = 'history'; });
    await page.locator('#tabbtn-history').click();
    const box = page.locator('#tab-history [role="alert"]');
    await expect(box.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(box.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
    const fit = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: window.innerWidth }));
    expect(fit.page).toBeLessThanOrEqual(fit.view);
  });
});

test.describe('שרת שלא עונה', () => {
  test('אחרי כ-6 שניות מופיע "אין חיבור" ו"הפנקס שלי" עובד', async ({ page }) => {
    await freshDevice(page);
    await page.getByRole('button', { name: /צור משפחה/ }).click();
    await page.getByRole('button', { name: /כניסה לקופה/ }).click();
    const title = page.getByRole('heading', { name: 'אין חיבור לשרת' });
    // מסך הטעינה, לא "אין חיבור" מוקדם מדי
    await page.waitForTimeout(4000);
    await expect(title).toBeHidden();
    await expect(page.locator('#screen-loading')).toHaveClass(/active/);
    await expect(title).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#screen-loading')).not.toHaveClass(/active/);

    await page.getByRole('button', { name: /הפנקס שלי/ }).click();
    await expect(page.getByRole('heading', { name: /הפנקס שלי/ })).toBeVisible();
    await expect(title).toBeHidden();
    await addEntry(page, 'iowe', 'דני', '10');
    await expect(openRows(page)).toHaveCount(1);
  });

  test('"ניסיון חוזר" חוזר לטעינה, וכשהחיבור חוזר המסך נעלם לבד', async ({ page }) => {
    await page.addInitScript(() => { window.__kupaStallMs = 700; }); // קיצור הזמן בבדיקה
    await freshDevice(page);
    await page.getByRole('button', { name: /צור משפחה/ }).click();
    await page.getByRole('button', { name: /כניסה לקופה/ }).click();
    const title = page.getByRole('heading', { name: 'אין חיבור לשרת' });
    await expect(title).toBeVisible({ timeout: 5000 });
    await expect(title).toBeVisible();
    const buttons = page.locator('#screen-offline button');
    for (const b of await buttons.all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);

    await page.getByRole('button', { name: 'ניסיון חוזר' }).click();
    await expect(title).toBeHidden();
    await expect(title).toBeVisible({ timeout: 5000 }); // עדיין אין שרת

    // החיבור חוזר: הרשימה מגיעה מהשרת, והמסך נעלם בלי שום לחיצה
    await serverReady(page);
    await expect(title).toBeHidden();
    await expect(page.getByRole('button', { name: /דמו של 10 שניות/ })).toBeVisible();
  });

  test('גם למי שיש לו כניסה שמורה: "הפנקס שלי" נפתח, וחזרה ממנו לא מוציאה מהכניסה', async ({ page }) => {
    await page.addInitScript(() => { window.__kupaStallMs = 700; localStorage.setItem('kupa-token', 'tok_saved'); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'אין חיבור לשרת' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /הפנקס שלי/ }).click();
    await expect(page.getByRole('heading', { name: /הפנקס שלי/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('kupa-token'))).toBe('tok_saved');
    await page.getByRole('button', { name: /חזרה/ }).first().click();
    await expect(page.getByRole('heading', { name: 'אין חיבור לשרת' })).toBeVisible({ timeout: 5000 });
  });
});

// הדמו הוא הורה: מסלול הגלגל המונפש (ילד ונוער) לא נבדק כאן. ברירת המחדל של playwright.config.js היא reducedMotion: 'reduce',
// ולכן למדידה של האנימציה האמיתית משנים אותה לחלק הזה בלבד.
test.describe('פתיחת "החשבון שלי"', () => {
  test.describe('עם תנועה', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('להורה: הקלה והמהירה, החלון נראה במלואו תוך פחות מ-500ms ובלי גלגל', async ({ page }) => {
      await freshDevice(page);
      await enterDemo(page);
      const r = await timeToOpen(page);
      expect(r.ms).toBeLessThan(500);
      expect(r.ms).toBeGreaterThan(80); // יש אנימציה קלה (180ms), לא קפיצה
      expect(r.launch).toBe(0);
      await expect(page.getByRole('heading', { name: 'החשבון שלי' })).toBeVisible();
    });
  });

  test('בהפחתת תנועה (הגדרת המכשיר) החלון מיידי', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // במפורש: ב-CI ההגדרה הגלובלית ב-playwright.config.js לא חלה על ההקשר
    await freshDevice(page);
    await enterDemo(page);
    const r = await timeToOpen(page);
    expect(r.ms).toBeLessThan(250);
    expect(r.duration).toBeLessThan(0.001);
    expect(r.launch).toBe(0);
  });

  test.describe('מתג "הפחתת תנועה" באפליקציה', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('כשהוא פעיל החלון מיידי גם כשהמכשיר לא מבקש הפחתה', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('kupa-motion', 'on'));
      await freshDevice(page);
      await enterDemo(page);
      const r = await timeToOpen(page);
      expect(r.ms).toBeLessThan(250);
      expect(r.duration).toBeLessThan(0.001);
    });
  });
});

// לוחץ על "החשבון שלי" ומודד עד שהחלון גלוי במלואו (אטימות 1, בלי טרנספורם, בלי אנימציה פעילה).
async function timeToOpen(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const btn = document.querySelector('header.top button[aria-label]');
    const t0 = performance.now();
    btn.click();
    let launch = 0;
    const tick = () => {
      launch = Math.max(launch, document.querySelectorAll('.gear-launch, .gear-sparks').length);
      const wrap = document.querySelector('.sheet-wrap');
      const sheet = document.querySelector('.sheet');
      if (wrap && !wrap.hidden) {
        const cs = getComputedStyle(sheet);
        if (cs.opacity === '1' && cs.transform === 'none' && sheet.getAnimations().length === 0) {
          resolve({ ms: performance.now() - t0, launch, duration: parseFloat(cs.animationDuration) || 0 });
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
}
