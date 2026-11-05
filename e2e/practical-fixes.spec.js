import { test, expect } from '@playwright/test';
import { addEntry, confirmBox, expectSum, freshDevice, openRows, openSetup, savedNotebook } from './helpers.js';

// תיקוני "משתמש פרקטי": ביטול מחיקה ותשלום, ספירת סכום בלי ערכי ביניים, הקמת קופה (שגיאות ומקלדת), טיוטה וחיפוש.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('loadingAnimSeen', '1')); // בלי אנימציית הטעינה הראשונה
  await freshDevice(page);
});

const undo = (page) => page.locator('.toast').getByRole('button', { name: 'בטל' });
const del = async (page, row) => {
  // המחיקה בתפריט "⋯" של השורה, לא כפתור צמוד ל"שולם"
  await row.getByRole('button', { name: 'עוד פעולות' }).click();
  await row.getByRole('menuitem', { name: /מחיקה/ }).click();
  await confirmBox(page).getByRole('button', { name: 'מחיקה' }).click();
};

test.describe('מחיקה עם ביטול', () => {
  test('toast "נמחק" עם "בטל" מחזיר את הרישום בדיוק (מזהה, תאריך ומקום)', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10', 'פיצה');
    await addEntry(page, 'iowe', 'רון', '20');
    await addEntry(page, 'owed', 'מיכל', '30');
    const before = await savedNotebook(page); // מהחדש לישן: מיכל, רון, דני
    await del(page, openRows(page).filter({ hasText: 'רון' }));
    await expect(page.locator('.toast')).toContainText('נמחק');
    await expect(openRows(page)).toHaveCount(2);
    await undo(page).click();
    await expect(openRows(page)).toHaveCount(3);
    expect((await savedNotebook(page)).entries).toEqual(before.entries);
    await expect(page.locator('.toast')).toBeHidden();
  });

  test('מחיקה של כמה רישומים בזה אחר זה: "בטל" מחזיר את האחרון בלבד, במקומו', async ({ page }) => {
    for (const [n, a] of [['נועם', '1'], ['עידו', '2'], ['שירה', '3'], ['תמר', '4']]) await addEntry(page, 'iowe', n, a);
    const before = await savedNotebook(page); // תמר, שירה, עידו, נועם
    await del(page, openRows(page).filter({ hasText: 'שירה' }));
    await del(page, openRows(page).filter({ hasText: 'עידו' }));
    await expect(openRows(page)).toHaveCount(2);
    await undo(page).click();
    const after = await savedNotebook(page);
    expect(after.entries.map((e) => e.name)).toEqual(['תמר', 'עידו', 'נועם']);
    expect(after.entries[1]).toEqual(before.entries.find((e) => e.name === 'עידו'));
  });
});

test.describe('"שולם" עם ביטול', () => {
  test('toast "סומן כשולם" ו"בטל" מחזירים את הרישום ללא שולם', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    const before = await savedNotebook(page);
    await openRows(page).first().getByRole('button', { name: /שולם/ }).click();
    await expect(page.locator('.toast')).toContainText('סומן כשולם');
    await expectSum(page, 'iowe', '0.00');
    await undo(page).click();
    await expectSum(page, 'iowe', '10.00');
    expect((await savedNotebook(page)).entries).toEqual(before.entries);
  });

  test('"עוד לא" מציג toast, ו"בטל" מחזיר לשולם', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await openRows(page).first().getByRole('button', { name: /שולם/ }).click();
    await page.locator('details.nb-paid summary').click();
    await page.locator('details.nb-paid').getByRole('button', { name: /עוד לא/ }).click();
    await expect(page.locator('.toast')).toContainText('חזר לרשימה הפתוחה');
    await undo(page).click();
    expect((await savedNotebook(page)).entries[0].paid).toBe(true);
  });

  test.describe('עם אנימציות', () => {
    test.use({ reducedMotion: 'no-preference' });
    test('הסכום למעלה לא עובר דרך ערכי ביניים שגויים', async ({ page }) => {
      await addEntry(page, 'iowe', 'דני', '43.02');
      await addEntry(page, 'owed', 'מיכל', '29.98');
      await expectSum(page, 'iowe', '43.02');
      await expectSum(page, 'owed', '29.98');
      await page.evaluate(() => {
        window.__seen = [];
        const num = (s) => document.querySelector('.summary .sum.' + s + ' .num');
        for (const s of ['owe', 'get']) {
          new MutationObserver(() => window.__seen.push(s + ':' + num(s).textContent.replace(/[^\d.]/g, '')))
            .observe(num(s), { childList: true, characterData: true, subtree: true });
        }
      });
      await openRows(page).filter({ hasText: 'דני' }).getByRole('button', { name: /שולם/ }).click();
      await openRows(page).filter({ hasText: 'מיכל' }).getByRole('button', { name: /שולם/ }).click();
      await expectSum(page, 'iowe', '0.00');
      await expectSum(page, 'owed', '0.00');
      await page.waitForTimeout(2500);
      const seen = await page.evaluate(() => window.__seen);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.filter((v) => !['owe:0.00', 'get:0.00'].includes(v))).toEqual([]);
    });
  });
});

test.describe('הקמת קופה: שגיאות בשפת הממשק', () => {
  test('שדה ריק: אין הודעת דפדפן, יש הודעה מותאמת עם role=alert ופוקוס לשדה הראשון', async ({ page }) => {
    await openSetup(page);
    await expect(page.locator('#screen-setup form')).toHaveAttribute('novalidate', '');
    await page.getByRole('button', { name: 'הקמת הקופה' }).click();
    await expect(page.getByRole('alert')).toHaveText('כתבו את שם המשפחה');
    await expect(page.locator('#screen-setup [data-f="familyName"] input')).toBeFocused();
    await expect(page.locator('#screen-setup [data-f="familyName"] input')).toHaveAttribute('aria-invalid', 'true');
  });

  test('אחרי שם המשפחה: השדה השגוי הבא מקבל את ההודעה והפוקוס', async ({ page }) => {
    await openSetup(page);
    await page.locator('#screen-setup [data-f="familyName"] input').fill('כהן');
    await page.getByRole('button', { name: 'הקמת הקופה' }).click();
    await expect(page.getByRole('alert')).toHaveText('כתבו איך קוראים לך');
    await expect(page.locator('#screen-setup [data-f="name"] input')).toBeFocused();
    await page.locator('#screen-setup [data-f="name"] input').fill('דנה');
    await page.getByRole('button', { name: 'הקמת הקופה' }).click();
    await expect(page.getByRole('alert')).toHaveText('תאריך לידה לא תקין');
  });
});

test.describe('הקמת קופה: המקלדת הפנימית לא מסתירה', () => {
  test('שדות השם, הקוד והמייל נשארים מעל המקלדת, וכפתור "הקמת הקופה" גלוי כשהמייל פעיל', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await openSetup(page);
    const kbTop = () => page.evaluate(() => document.querySelector('.kb').getBoundingClientRect().top);
    const bottom = (sel) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().bottom);
    for (const f of ['name', 'pin', 'email']) {
      await page.locator(`#screen-setup [data-f="${f}"] input`).focus();
      await page.waitForTimeout(1200);
      expect(await bottom(`#screen-setup [data-f="${f}"] input`)).toBeLessThanOrEqual(await kbTop());
    }
    expect(await bottom('#screen-setup button[type=submit]')).toBeLessThanOrEqual(await kbTop());
  });
});

test.describe('טיוטה', () => {
  test('רישום שלא נשמר חוזר אחרי רענון, ונמחק אחרי סגירה מפורשת', async ({ page }) => {
    await page.getByRole('button', { name: 'אני חייב כסף' }).click();
    await page.getByLabel('למי?').fill('דני');
    await page.getByLabel('כמה?').fill('12.5');
    await page.getByLabel('על מה? (אפשר לדלג)').fill('פיצה');
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('למי?')).toHaveValue('דני');
    await expect(page.getByLabel('כמה?')).toHaveValue('12.5');
    await expect(page.getByLabel('על מה? (אפשר לדלג)')).toHaveValue('פיצה');
    await page.getByRole('button', { name: 'סגירה' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: /הפנקס שלי/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('kupa-draft-notebook-iowe'))).toBeNull();
  });

  test('שמירה מוצלחת מנקה את הטיוטה', async ({ page }) => {
    await addEntry(page, 'owed', 'מיכל', '5');
    expect(await page.evaluate(() => localStorage.getItem('kupa-draft-notebook-owed'))).toBeNull();
  });

  test('בהקמת קופה נשמרים רק שמות, והקוד הסודי והמייל אף פעם', async ({ page }) => {
    await openSetup(page);
    await page.locator('#screen-setup [data-f="familyName"] input').fill('כהן');
    await page.locator('#screen-setup [data-f="name"] input').fill('דנה');
    await page.locator('#screen-setup [data-f="pin"] input').fill('123456');
    await page.locator('#screen-setup [data-f="email"] input').fill('a@b.co');
    const raw = await page.evaluate(() => localStorage.getItem('kupa-draft-setup'));
    expect(raw).toContain('כהן');
    expect(raw).not.toContain('123456');
    expect(raw).not.toContain('a@b.co');
  });
});

test.describe('חיפוש בפנקס', () => {
  test('ברשימה קצרה אין חיפוש', async ({ page }) => {
    await addEntry(page, 'iowe', 'דני', '10');
    await expect(page.getByRole('search')).toHaveCount(0);
  });

  test('ברשימה ארוכה: סינון לפי שם, הערה וסכום, ומצב "לא נמצא כלום" עם ניקוי', async ({ page }) => {
    test.setTimeout(90000);
    const names = ['נועם', 'עידו', 'שירה', 'תמר', 'גיל', 'רותם', 'אורי', 'מיכל', 'יובל']; // שמות רחוקים זה מזה, כדי שלא תיפתח שאלת איחוד
    for (let i = 1; i <= 9; i++) await addEntry(page, 'iowe', names[i - 1], String(i * 10), i === 4 ? 'פיצה' : '');
    const find = page.getByRole('search').getByRole('textbox');
    await expect(find).toBeVisible();
    await find.fill('שירה');
    await expect(openRows(page)).toHaveCount(1);
    await find.fill('פיצה');
    await expect(openRows(page)).toHaveCount(1);
    await expect(openRows(page).first()).toContainText('תמר');
    await find.fill('50');
    await expect(openRows(page)).toHaveCount(1);
    await expect(openRows(page).first()).toContainText('גיל');
    await expectSum(page, 'iowe', '450.00'); // הסיכום לא מושפע מהסינון
    await find.fill('zzz');
    await expect(page.getByText('לא נמצא כלום עבור “zzz”')).toBeVisible();
    await page.getByRole('button', { name: 'ניקוי החיפוש' }).last().click();
    await expect(find).toHaveValue('');
    await expect(openRows(page)).toHaveCount(9);
  });
});
