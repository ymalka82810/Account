import { expect } from '@playwright/test';

// מכשיר חדש: בלי נתונים שמורים. נפתח ישר לפנקס האישי.
export async function freshDevice(page) {
  // דיאלוג מערכת (alert/confirm של הדפדפן) אסור באפליקציה: כל חלון צריך להיות מעוצב שלנו.
  page.on('dialog', (d) => { throw new Error('נפתח דיאלוג מערכת: ' + d.message()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /הפנקס שלי/ })).toBeVisible();
}

// רישום בפנקס. dir: 'iowe' (אני חייב) או 'owed' (חייבים לי)
export async function addEntry(page, dir, name, amount, note = '') {
  await page.getByRole('button', { name: dir === 'iowe' ? 'אני חייב כסף' : 'חייבים לי כסף' }).click();
  await page.getByLabel(dir === 'iowe' ? 'למי?' : 'מי חייב לי?').fill(name);
  await page.getByLabel('כמה?').fill(String(amount));
  if (note) await page.getByLabel('על מה? (אפשר לדלג)').fill(note);
  await page.getByRole('button', { name: 'רישום', exact: true }).click();
}

export const openRows = (page) => page.locator('.nb-page .list').first().locator('.row');
export const summary = (page, which) => page.locator(`.summary .sum.${which === 'iowe' ? 'owe' : 'get'}`);
// הסכומים מוצגים עם סימני כיוון (RLM) ועם אנימציית ספירה; משווים רק את הספרות.
export async function expectSum(page, which, value) {
  await expect(summary(page, which)).toContainText(value, { timeout: 5000 });
}

export const confirmBox = (page) => page.getByRole('alertdialog');
export const savedNotebook = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kupa-notebook-v1') || 'null'));
