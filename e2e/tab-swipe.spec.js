import { test, expect } from '@playwright/test';
import { serverReady } from './helpers.js';

// החלקה הצידה על התוכן מחליפה לשונית לפי הסדר בתפריט (useTabSwipe). בעברית: אצבע ימינה = הלשונית הבאה (משמאל).
test.use({ viewport: { width: 390, height: 844 } });

async function enterDemo(page) {
  await page.goto('/');
  await page.locator('.nb-fam-btn').click();
  await page.locator('.sheet .form button.ghost').click();
  await serverReady(page);
  await page.locator('.welcome-actions .ghost').click();
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 15000 });
}

// מגע מדומה: pointerdown, כמה צעדי pointermove ו-pointerup על אלמנט בתוך main.
async function swipe(page, dx, dy = 0) {
  await page.evaluate(([dx, dy]) => {
    const target = document.querySelector('main .panel.active h2, main .panel.active') || document.querySelector('main');
    const r = target.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = r.top + Math.min(40, r.height / 2);
    const fire = (type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
    fire('pointerdown', x0, y0);
    for (let i = 1; i <= 8; i++) fire('pointermove', x0 + (dx * i) / 8, y0 + (dy * i) / 8);
    fire('pointerup', x0 + dx, y0 + dy);
  }, [dx, dy]);
}

const active = (page) => page.locator('nav.tabs [role="tab"][aria-selected="true"]');

// מרכז הפס המודגש נמצא מתחת ללשונית הנבחרת
async function expectIndicatorUnderActive(page) {
  await expect.poll(() => page.evaluate(() => {
    const ind = document.querySelector('nav.tabs .tab-indicator').getBoundingClientRect();
    const tab = document.querySelector('nav.tabs [aria-selected="true"]').getBoundingClientRect();
    const mid = ind.left + ind.width / 2;
    return ind.width > 0 && mid > tab.left && mid < tab.right;
  })).toBe(true);
}

// באמצע החלקה (בלי לשחרר) הפס כבר זז מהלשונית הנוכחית לעבר הבאה
async function indicatorMovesMidSwipe(page, dx) {
  return page.evaluate((dx) => {
    const ind = document.querySelector('nav.tabs .tab-indicator');
    const before = ind.getBoundingClientRect().left;
    const target = document.querySelector('main .panel.active');
    const r = target.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + 40;
    const fire = (type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y0 }));
    fire('pointerdown', x0);
    for (let i = 1; i <= 4; i++) fire('pointermove', x0 + (dx * i) / 4);
    const mid = ind.getBoundingClientRect().left;
    fire('pointercancel', x0 + dx);
    return Math.abs(mid - before);
  }, dx);
}

test('החלקה ימינה ושמאלה מחליפה לשונית, וגלילה אנכית לא', async ({ page }) => {
  await enterDemo(page);
  await expect(active(page)).toHaveAttribute('data-tab', 'family');
  await expectIndicatorUnderActive(page);
  expect(await indicatorMovesMidSwipe(page, 60)).toBeGreaterThan(5);
  await expect(active(page)).toHaveAttribute('data-tab', 'family');

  // להורה הסדר על המסך (מימין לשמאל): משפחה, בית, היסטוריה, ניהול
  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'home');
  await expectIndicatorUnderActive(page);
  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'history');
  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'manage');
  await expectIndicatorUnderActive(page);

  // בקצה אין לאן: נשארים
  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'manage');

  await swipe(page, -200);
  await expect(active(page)).toHaveAttribute('data-tab', 'history');
  await expectIndicatorUnderActive(page);

  // תנועה אנכית בעיקר - לא מחליפה
  await swipe(page, 40, 220);
  await expect(active(page)).toHaveAttribute('data-tab', 'history');
});

// האזור הריק מתחת לתוכן הוא חלק מיעד ההחלקה: main נמתח עד תחתית המסך.
test('ה-main נמתח עד תחתית המסך כך שהחלקה באזור הריק עובדת', async ({ page }) => {
  await enterDemo(page);
  const bottom = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().bottom);
  expect(bottom).toBeGreaterThanOrEqual(844 - 1);
});
