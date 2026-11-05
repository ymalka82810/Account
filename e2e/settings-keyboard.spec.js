import { test, expect } from '@playwright/test';
import { addEntry, confirmBox, expectSum, freshDevice, openRows, savedNotebook } from './helpers.js';

test.beforeEach(async ({ page }) => { await freshDevice(page); });

const openSettings = async (page) => {
  await page.getByRole('button', { name: 'הגדרות' }).click();
  await expect(page.getByRole('heading', { name: /הגדרות/ })).toBeVisible();
};

test.describe('הגדרות הפנקס', () => {
  test('נפתחות מגלגל השיניים, וכפתור "חזרה" של הטלפון מחזיר לעמוד הראשי', async ({ page }) => {
    await openSettings(page);
    await expect(page).toHaveURL(/#nb-settings$/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: /הפנקס שלי/ })).toBeVisible();
  });

  test('בחירת עיצוב נשמרת, וצבעי הניאון מופיעים רק בעיצוב ניאון', async ({ page }) => {
    await openSettings(page);
    const looks = page.getByRole('radiogroup', { name: 'עיצוב' });
    await expect(page.getByRole('radiogroup', { name: 'צבעי הניאון' })).toHaveCount(0);
    await looks.getByRole('radio', { name: /ניאון/ }).click();
    await expect(looks.getByRole('radio', { name: /ניאון/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radiogroup', { name: 'צבעי הניאון' })).toBeVisible();
    expect((await savedNotebook(page)).settings.look).toBe('neon');
  });

  test('גודל הכתב נשמר', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('radiogroup', { name: 'גודל הכתב' }).getByRole('radio', { name: 'גדול' }).click();
    expect((await savedNotebook(page)).settings.textSize).toBe('large');
  });

  test('החלפת מטבע משנה את הסימן אבל לא את הסכום', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await openSettings(page);
    await page.locator('.nb-section', { hasText: 'מטבע' }).locator('.dd-btn').click();
    await page.getByRole('option', { name: /^\$ דולר אמריקאי/ }).click();
    await page.goBack();
    await expectSum(page, 'iowe', '10.00');
    await expect(page.locator('.summary .sum.owe')).toContainText('$');
    expect((await savedNotebook(page)).entries[0].amount).toBe(1000);
  });

  test('סדר לפי סכום מציג את הגדול ראשון', async ({ page }) => {
    await addEntry(page, 'iowe', 'קטן', '1');
    await addEntry(page, 'iowe', 'גדול', '50');
    await addEntry(page, 'iowe', 'בינוני', '5');
    await openSettings(page);
    await page.locator('.nb-section', { hasText: 'סדר הרישומים' }).locator('.dd-btn').click();
    await page.getByRole('option', { name: 'הסכום הגדול קודם' }).click();
    await page.goBack();
    await expect(openRows(page).locator('strong').first()).toHaveText('גדול');
  });

  test('"מחיקת כל הפנקס" מבקשת אישור מעוצב ומרוקנת', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'owed', 'מיכל', '3');
    await openSettings(page);
    await page.getByRole('button', { name: /מחיקת כל הפנקס/ }).click();
    await confirmBox(page).getByRole('button', { name: 'מחיקה' }).click();
    await page.goBack();
    await expect(page.getByText('עוד אין כלום ברשימה')).toBeVisible();
  });

  test('"מחיקת מה ששולם" מוחקת רק רישומים ששולמו', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'iowe', 'רון', '5');
    await openRows(page).filter({ hasText: 'רון' }).getByRole('button', { name: /שולם/ }).click();
    await openSettings(page);
    await page.getByRole('button', { name: /מחיקת מה ששולם/ }).click();
    await confirmBox(page).getByRole('button', { name: 'מחיקה' }).click();
    const nb = await savedNotebook(page);
    expect(nb.entries.map((e) => e.name)).toEqual(['דני']);
  });

  test('מעבר לאנגלית מתרגם את המסך ומשנה את כיוון הדף', async ({ page }) => {
    await openSettings(page);
    await page.locator('.nb-section', { hasText: 'מראה ונראות' }).locator('.dd-btn').first().click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.goBack();
    await expect(page.getByRole('button', { name: /owe/i }).first()).toBeVisible();
  });
});

test.describe('המקלדת של האפליקציה', () => {
  test('שדה סכום פותח מקלדת מספרים בלבד, ומקלדת המערכת חסומה', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    const amount = page.getByLabel('כמה?');
    await amount.click();
    const kb = page.locator('.kb');
    await expect(kb).toHaveClass(/kb-numeric/);
    await expect(amount).toHaveAttribute('inputmode', 'none');
    for (const d of ['0', '5', '9', '.']) await expect(kb.getByRole('button', { name: d, exact: true })).toBeVisible();
    await expect(kb.getByRole('button', { name: 'א', exact: true })).toHaveCount(0);
  });

  test('הקלדה במקשים ומחיקה עובדות, והרישום נשמר', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    await page.getByLabel('למי?').fill('דני');
    const amount = page.getByLabel('כמה?');
    await amount.click();
    const kb = page.locator('.kb');
    for (const k of ['1', '2', '3', '.', '5']) await kb.getByRole('button', { name: k, exact: true }).click();
    await kb.getByRole('button', { name: 'מחיקה' }).click();
    await kb.getByRole('button', { name: '7', exact: true }).click();
    await expect(amount).toHaveValue('123.7');
    await page.getByRole('button', { name: 'רישום', exact: true }).click();
    await expectSum(page, 'iowe', '123.70');
  });

  test('בעברית הנקודה העשרונית בצד ימין של האפס', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    await page.getByLabel('כמה?').click();
    const kb = page.locator('.kb');
    const zero = await kb.getByRole('button', { name: '0', exact: true }).boundingBox();
    const dot = await kb.getByRole('button', { name: '.', exact: true }).boundingBox();
    expect(dot.x).toBeGreaterThan(zero.x);
  });

  test('שדה שם פותח מקלדת אותיות', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    await page.getByLabel('למי?').click();
    await expect(page.locator('.kb')).toHaveClass(/kb-text/);
  });
});
