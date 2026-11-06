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

// בבדיקות אין שרת, ומסך הפתיחה של מכשיר עם קופה מחכה לתשובה על הורים מהגרסה הישנה (App.jsx: currentScreen).
// מדמים תשובה ריקה דרך ה-state של האפליקציה (עובד מול שרת הפיתוח של vite), כדי להגיע למסך הפתיחה.
export async function serverReady(page) {
  await page.evaluate(async () => {
    const m = await import('/src-react/state/state.js');
    m.state.legacyPeople = [];
    m.state.codeChecked = true;
    m.bumpAuth();
  });
}

// שרת שלא עונה: מחליף את config.js בכתובת מתה, כדי שהבדיקה לא תלויה בשרת אמיתי (ולא מייצרת תעבורה אליו).
export async function deadServer(page) {
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.CONVEX_URL = "http://127.0.0.1:9";' }));
}

// מסך הקמת הקופה במכשיר חדש. הרישום ברשימת ההורים הישנה מגיע מהשרת, ובבדיקות אין שרת:
// מדמים תשובה ריקה דרך ה-state של האפליקציה (עובד מול שרת הפיתוח של vite).
export async function openSetup(page) {
  await page.getByRole('button', { name: /צור משפחה/ }).click();
  await page.getByRole('button', { name: /יצירת קופה משפחתית/ }).click();
  await page.evaluate(async () => {
    const m = await import('/src-react/state/state.js');
    m.state.legacyPeople = [];
    m.state.codeChecked = true;
    m.bumpAuth();
  });
  await expect(page.getByRole('heading', { name: 'הקמת קופה משפחתית' })).toBeVisible({ timeout: 10000 });
}
