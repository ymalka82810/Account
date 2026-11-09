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

test('החלקה ימינה ושמאלה מחליפה לשונית, וגלילה אנכית לא', async ({ page }) => {
  await enterDemo(page);
  await expect(active(page)).toHaveAttribute('data-tab', 'family');

  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'manage');

  // בקצה אין לאן: נשארים
  await swipe(page, 200);
  await expect(active(page)).toHaveAttribute('data-tab', 'manage');

  await swipe(page, -200);
  await expect(active(page)).toHaveAttribute('data-tab', 'family');
  await swipe(page, -200);
  await expect(active(page)).toHaveAttribute('data-tab', 'history');

  // תנועה אנכית בעיקר - לא מחליפה
  await swipe(page, 40, 220);
  await expect(active(page)).toHaveAttribute('data-tab', 'history');
});
