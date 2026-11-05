import { test, expect } from '@playwright/test';
import { addEntry, confirmBox, expectSum, freshDevice, openRows, savedNotebook } from './helpers.js';

test.beforeEach(async ({ page }) => { await freshDevice(page); });

test.describe('מסך הפתיחה של מכשיר חדש', () => {
  test('נפתח ישר לפנקס, בלי שאלה על משפחה ובלי כניסה', async ({ page }) => {
    await expect(page.getByText('עוד אין כלום ברשימה')).toBeVisible();
    await expectSum(page, 'iowe', '0.00');
    await expectSum(page, 'owed', '0.00');
    await expect(page.getByRole('button', { name: /צור משפחה/ })).toBeVisible();
    // הצעת השדרוג מופיעה רק אחרי רישום ראשון
    await expect(page.getByRole('button', { name: /יצירת קופה משפחתית/ })).toHaveCount(0);
  });
});

test.describe('רישום חוב', () => {
  test('"אני חייב" נכנס לרשימה ולסיכום', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '12.5', 'פיצה');
    await expect(openRows(page)).toHaveCount(1);
    await expect(openRows(page).first()).toContainText('דני');
    await expect(openRows(page).first()).toContainText('פיצה');
    await expectSum(page, 'iowe', '12.50');
    await expectSum(page, 'owed', '0.00');
  });

  test('"חייבים לי" נכנס לצד השני של הסיכום', async ({ page }) => {
    await addEntry(page, 'owed', 'מיכל', '30');
    await expectSum(page, 'owed', '30.00');
    await expectSum(page, 'iowe', '0.00');
  });

  test('כמה רישומים מסתכמים', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'iowe', 'רון', '5.25');
    await expectSum(page, 'iowe', '15.25');
    await expect(openRows(page)).toHaveCount(2);
  });

  test('פסיק עשרוני מתקבל כמו נקודה', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '7,5');
    await expectSum(page, 'iowe', '7.50');
  });

  test('בלי שם: הודעת שגיאה והטופס נשאר פתוח', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    await page.getByLabel('כמה?').fill('10');
    await page.getByRole('button', { name: 'רישום', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('כתבו את השם');
    await expect(page.getByLabel('למי?')).toHaveAttribute('aria-invalid', 'true');
  });

  for (const bad of ['', '0', '-3', 'abc']) {
    test(`סכום לא תקין ("${bad}") נדחה`, async ({ page }) => {
      await page.getByRole('button', { name: 'אני חייב כסף' }).click();
      await page.getByLabel('למי?').fill('דני');
      if (bad) await page.getByLabel('כמה?').fill(bad);
      await page.getByRole('button', { name: 'רישום', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('כתבו סכום');
    });
  }

  test('אחרי רישום ראשון מוצעת קופה משפחתית', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await expect(page.getByRole('button', { name: /יצירת קופה משפחתית/ })).toBeVisible();
  });
});

test.describe('שמירה במכשיר', () => {
  test('הרישומים נשארים אחרי רענון הדף', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'owed', 'מיכל', '4');
    await page.reload();
    await expect(openRows(page)).toHaveCount(2);
    await expectSum(page, 'iowe', '10.00');
    await expectSum(page, 'owed', '4.00');
  });

  test('הסכום נשמר במאיות (אגורות) ולא כמספר עשרוני', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '12.34');
    const nb = await savedNotebook(page);
    expect(nb.entries[0].amount).toBe(1234);
  });
});

test.describe('תשלום ומחיקה', () => {
  test('סימון "שולם" מוריד מהסיכום ומעביר לרשימת "שולמו"; "עוד לא" מחזיר', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await openRows(page).first().getByRole('button', { name: /שולם/ }).click();
    await expectSum(page, 'iowe', '0.00');
    await expect(page.getByText('אין כלום פתוח!')).toBeVisible();
    const paid = page.locator('details.nb-paid');
    await expect(paid.locator('summary')).toContainText('שולמו (1)');
    await paid.locator('summary').click();
    await paid.getByRole('button', { name: /עוד לא/ }).click();
    await expectSum(page, 'iowe', '10.00');
  });

  test('מחיקה פותחת חלון אישור מעוצב; "חזרה" לא מוחק', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await openRows(page).first().getByRole('button', { name: 'מחיקה' }).click();
    await expect(confirmBox(page)).toBeVisible();
    await expect(confirmBox(page)).toContainText('למחוק את הרישום של דני?');
    await confirmBox(page).getByRole('button', { name: 'חזרה' }).click();
    await expect(openRows(page)).toHaveCount(1);
  });

  test('אישור המחיקה מוחק', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await openRows(page).first().getByRole('button', { name: 'מחיקה' }).click();
    await confirmBox(page).getByRole('button', { name: 'מחיקה' }).click();
    await expect(confirmBox(page)).toHaveCount(0);
    await expect(page.getByText('עוד אין כלום ברשימה')).toBeVisible();
    expect((await savedNotebook(page)).entries).toHaveLength(0);
    await expectSum(page, 'iowe', '0.00');
  });
});

test.describe('שמות מוכרים', () => {
  test('שם שנרשם מוצע שוב בלחיצה', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    const chips = page.getByRole('group', { name: 'שמות מוכרים' });
    await chips.getByRole('button', { name: 'דני' }).click();
    await expect(page.getByLabel('למי?')).toHaveValue('דני');
    await page.getByLabel('כמה?').fill('5');
    await page.getByRole('button', { name: 'רישום', exact: true }).click();
    const nb = await savedNotebook(page);
    expect(nb.people).toHaveLength(1);
    expect(nb.entries[0].personId).toBe(nb.entries[1].personId);
  });

  test('בלי הקלדה מוצגים רק 3 השמות הכי בשימוש', async ({ page }) => {
    for (const n of ['אבי', 'בני', 'גלי', 'דנה']) await addEntry(page, 'iowe', n, '1');
    await addEntry(page, 'iowe', 'דנה', '1');
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    const chips = page.getByRole('group', { name: 'שמות מוכרים' }).getByRole('button');
    await expect(chips).toHaveCount(3);
    await expect(chips.first()).toHaveText('דנה');
  });

  test('שם דומה (דני/דניאל) שואל אם לאחד; "לשנות הכול" מאחד תחת השם החדש', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'iowe', 'דניאל', '5');
    await expect(page.getByText('יש כבר “דני” בפנקס.')).toBeVisible();
    await page.getByRole('button', { name: /לשנות הכול ל“דניאל”/ }).click();
    const nb = await savedNotebook(page);
    expect(nb.people.map((p) => p.name)).toEqual(['דניאל']);
    expect(nb.entries.every((e) => e.name === 'דניאל')).toBe(true);
  });

  test('"לא, זה אדם אחר" שומר שני אנשים נפרדים', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'iowe', 'דניאל', '5');
    await page.getByRole('button', { name: 'לא, זה אדם אחר' }).click();
    const nb = await savedNotebook(page);
    expect(nb.people.map((p) => p.name).sort()).toEqual(['דני', 'דניאל']);
  });
});

test.describe('קיזוז חובות הדדיים', () => {
  test('חוב לשני הכיוונים מול אותו אדם מציע קיזוז ומשאיר רק את ההפרש', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await addEntry(page, 'owed', 'דני', '4');
    const offer = page.locator('.nb-offset');
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: /קיזוז/ }).click();
    await confirmBox(page).getByRole('button', { name: /אישור|קיזוז|כן/ }).first().click();
    await expectSum(page, 'iowe', '6.00');
    await expectSum(page, 'owed', '0.00');
    await expect(offer).toHaveCount(0);
  });
});
