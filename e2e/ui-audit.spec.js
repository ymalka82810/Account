import { test, expect } from '@playwright/test';
import { addEntry, freshDevice, confirmBox, serverReady } from './helpers.js';

// בדיקות עיצוב ושימוש: לשוניות בלי גלישה, מחסנית החלונות, מתגי "תחושה" ומטרות מגע.
// מסך הקופה המשפחתית נבדק במצב דמו (משפחה לדוגמה שנבנית בדפדפן, בלי שרת): הורה עם ארבע לשוניות.
const PHONE = { width: 390, height: 844 };

// מהפנקס (מכשיר חדש) דרך "צור משפחה" > "כניסה לקופה" אל מסך הפתיחה, ומשם לדמו.
async function enterDemo(page) {
  await page.getByRole('button', { name: /צור משפחה/ }).click();
  await page.getByRole('button', { name: /כניסה לקופה/ }).click();
  await serverReady(page);
  await page.getByRole('button', { name: /דמו של 10 שניות/ }).click();
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 15000 });
}

const openAccount = async (page) => {
  await page.getByRole('button', { name: 'החשבון שלי' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'החשבון שלי' })).toBeVisible();
};

test.use({ viewport: PHONE });

test.describe('סרגל הלשוניות', () => {
  for (const lang of ['he', 'en']) {
    test(`4 לשוניות להורה ב-390px בלי גלישה אופקית (${lang})`, async ({ page }) => {
      await page.addInitScript((l) => { try { localStorage.setItem('kupa-lang', l); } catch (e) { /* */ } }, lang);
      await page.goto('/');
      await page.locator('.nb-fam-btn').click();
      await page.locator('.sheet .form button.ghost').click();
      await serverReady(page);
      await page.locator('.welcome-actions .ghost').click();
      await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 15000 });

      const tabs = page.locator('nav.tabs [role="tab"]');
      await expect(tabs).toHaveCount(4);
      const fit = await page.evaluate(() => {
        const nav = document.querySelector('nav.tabs');
        return { scroll: nav.scrollWidth, client: nav.clientWidth, page: document.documentElement.scrollWidth, view: window.innerWidth };
      });
      expect(fit.scroll).toBeLessThanOrEqual(fit.client);
      expect(fit.page).toBeLessThanOrEqual(fit.view);
      for (let i = 0; i < 4; i++) {
        const box = await tabs.nth(i).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // "ניהול" נראית במלואה (לא חתוכה)
      if (lang === 'he') await expect(page.getByRole('tab', { name: 'ניהול' })).toBeInViewport({ ratio: 1 });
      // התווית הקצרה של לשונית המשפחה
      if (lang === 'he') await expect(page.getByRole('tab', { name: 'משפחה', exact: true })).toBeVisible();
    });
  }
});

test.describe('החשבון שלי', () => {
  test.beforeEach(async ({ page }) => { await freshDevice(page); await enterDemo(page); });

  test('מאורגן בקבוצות עם כותרות, "משפחות נוספות" סגור ו"יציאה" אחרונה', async ({ page }) => {
    await openAccount(page);
    for (const h of ['פרופיל', 'אבטחה', 'תחושה']) await expect(page.getByRole('heading', { name: h, level: 3 })).toBeVisible();
    const more = page.locator('details.acct-more');
    await expect(more).not.toHaveAttribute('open', '');
    await more.locator('summary').click();
    await expect(page.getByRole('button', { name: /הצטרפות למשפחה נוספת/ })).toBeVisible();
    const buttons = page.getByRole('dialog').getByRole('button');
    await expect(buttons.filter({ hasText: /^יציאה$/ })).toHaveCount(1);
    const exit = await page.locator('.acct-exit').boundingBox();
    const lastRow = await page.locator('.acct-more .acct-row').last().boundingBox();
    expect(exit.y).toBeGreaterThan(lastRow.y);

    // השורות בתוך "משפחות נוספות" לא נוגעות זו בזו ולא בכותרת
    const rows = page.locator('.acct-more .acct-row');
    const first = await rows.first().boundingBox();
    const summary = await page.locator('.acct-more > summary').boundingBox();
    expect(first.y - (summary.y + summary.height)).toBeGreaterThanOrEqual(6);
    if (await rows.count() > 1) {
      const second = await rows.nth(1).boundingBox();
      expect(second.y - (first.y + first.height)).toBeGreaterThanOrEqual(6);
    }
  });

  test('מחסנית החלונות: חץ חזרה, Back של הדפדפן ו-Escape סוגרים שלב אחד', async ({ page }) => {
    const gear = page.getByRole('button', { name: 'החשבון שלי' });
    await openAccount(page);
    await expect(page.locator('.sheet-back')).toHaveCount(0);
    const url = page.url();

    // חלון שני: חץ חזרה בכותרת, והחלון הראשון נשאר בזיכרון
    await page.getByRole('button', { name: /דמות/ }).first().click();
    await expect(page.getByRole('heading', { name: 'דמות', level: 2 })).toBeVisible();
    const back = page.locator('.sheet-back');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page.getByRole('heading', { name: 'החשבון שלי', level: 2 })).toBeVisible();
    await expect(back).toHaveCount(0);

    // כפתור Back של הדפדפן/אנדרואיד: חוזר שלב, ואז סוגר, ונשארים באפליקציה
    await page.getByRole('button', { name: /דמות/ }).first().click();
    await expect(back).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'החשבון שלי', level: 2 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('nav.tabs')).toBeVisible();
    expect(page.url()).toBe(url);

    // Escape סוגר שלב, והפוקוס חוזר לכפתור שפתח
    await openAccount(page);
    await page.getByRole('button', { name: /דמות/ }).first().click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'החשבון שלי', level: 2 })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(gear).toBeFocused();
  });

  test('✕ סוגר את כל החלונות בבת אחת, וכפתור Back אחר כך לא סוגר שוב', async ({ page }) => {
    await openAccount(page);
    await page.getByRole('button', { name: /דמות/ }).first().click();
    await page.getByRole('button', { name: 'סגירה' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('מתג צליל ורטט נשמרים במכשיר', async ({ page }) => {
    await openAccount(page);
    const sound = page.getByRole('switch', { name: /צליל/ });
    const vib = page.getByRole('switch', { name: /רטט/ });
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    await sound.click();
    await vib.click();
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await expect(vib).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => [localStorage.getItem('kupa-sound'), localStorage.getItem('kupa-vibrate')])).toEqual(['0', '0']);
    await sound.click();
    expect(await page.evaluate(() => localStorage.getItem('kupa-sound'))).toBe('1');
  });

  test('הפחתת תנועה: data-motion על ה-body ומשך מעברים בפועל', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // המכשיר מבקש הפחתה (במפורש, לא תלוי בהגדרות הריצה)
    await openAccount(page);
    const group = page.getByRole('radiogroup', { name: 'הפחתת תנועה' });
    const dur = () => page.evaluate(() => getComputedStyle(document.querySelector('.bigbtn')).transitionDuration);
    // בדיקות ה-E2E רצות עם מכשיר שמבקש הפחתה: "לפי המכשיר" = מקוצר
    await expect(group.getByRole('radio', { name: 'לפי המכשיר' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => document.body.dataset.motion)).toBeUndefined();
    expect(parseFloat(await dur())).toBeLessThan(0.001);
    // כבוי = תנועה מלאה גם אם המכשיר מבקש הפחתה
    await group.getByRole('radio', { name: 'כבוי' }).click();
    expect(await page.evaluate(() => document.body.dataset.motion)).toBe('on');
    expect(parseFloat(await dur())).toBeGreaterThan(0.05);
    // מופעל = מקוצר
    await group.getByRole('radio', { name: 'מופעל' }).click();
    expect(await page.evaluate(() => document.body.dataset.motion)).toBe('off');
    expect(parseFloat(await dur())).toBeLessThan(0.001);
    expect(await page.evaluate(() => localStorage.getItem('kupa-motion'))).toBe('on');
    // חוזר אחרי רענון (מחוץ לדמו, בפנקס): המתג נטען מהמכשיר
    await page.reload();
    expect(await page.evaluate(() => document.body.dataset.motion)).toBe('off');
  });

  test('מטרות מגע של לפחות 44px בכותרת, בחלון וב"החשבון שלי"', async ({ page }) => {
    const small = async (scope) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el) => { const r = el.getBoundingClientRect(); return { text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((b) => b.w > 0 && (b.h < 43.5 || b.w < 43.5)), scope);
    expect(await small('.demo-banner button, header.top button, nav.tabs button')).toEqual([]);
    await openAccount(page);
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    expect(await small('.sheet button, .sheet summary, .sheet .dd-btn')).toEqual([]);
    const links = await page.evaluate(() => [...document.querySelectorAll('.sheet .legal a')].map((a) => Math.round(a.getBoundingClientRect().height)));
    expect(Math.min(...links)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('הפנקס: שולם ומחיקה', () => {
  test.beforeEach(async ({ page }) => { await freshDevice(page); });

  test('"שולם" ראשי, והמחיקה בתפריט "⋯" ולא צמודה', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    const row = page.locator('.nb-page .list .row').first();
    await expect(row.getByRole('button', { name: /שולם/ })).toBeVisible();
    await expect(row.getByRole('button', { name: 'מחיקה' })).toHaveCount(0);
    await row.getByRole('button', { name: 'עוד פעולות' }).click();
    const del = row.getByRole('menuitem', { name: /מחיקה/ });
    await expect(del).toBeVisible();
    // Escape סוגר את התפריט בלי למחוק
    await page.keyboard.press('Escape');
    await expect(del).toHaveCount(0);
    await row.getByRole('button', { name: 'עוד פעולות' }).click();
    await row.getByRole('menuitem', { name: /מחיקה/ }).click();
    await expect(confirmBox(page)).toBeVisible();
  });

  test('נקודת כניסה אחת למשפחה: צור משפחה וכניסה בחלון אחד', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    // אין כרטיס שדרוג וקישור נפרדים בתחתית
    await expect(page.getByRole('button', { name: /כניסה לקופה/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /יצירת קופה משפחתית/ })).toHaveCount(0);
    await page.getByRole('button', { name: /צור משפחה/ }).click();
    await expect(page.getByRole('button', { name: /יצירת קופה משפחתית/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /כניסה לקופה/ })).toBeVisible();
  });
});

test.describe('הגדרות הפנקס: מקור אחד', () => {
  test('פלטות הניאון עם אותם שלושה שמות כמו ב"החשבון שלי"', async ({ page }) => {
    await freshDevice(page);
    await page.getByRole('button', { name: 'הגדרות' }).click();
    await page.getByRole('radiogroup', { name: 'עיצוב' }).getByRole('radio', { name: /ניאון/ }).click();
    const names = await page.getByRole('radiogroup', { name: 'צבעי הניאון' }).getByRole('radio').allTextContents();
    expect(names.map((s) => s.trim())).toEqual(['כחול + סגול', 'ירוק + צהוב', 'כתום + ורוד']);
  });

  test('במסך הפתיחה השפה היא קישור קטן שפותח את אותו בורר', async ({ page }) => {
    await freshDevice(page);
    await page.getByRole('button', { name: /צור משפחה/ }).click();
    await page.getByRole('button', { name: /כניסה לקופה/ }).click();
    await serverReady(page);
    await page.getByRole('button', { name: /^שפה/ }).click();
    await expect(page.getByRole('dialog').locator('.dd-btn')).toBeVisible();
  });
});
