# מטבעות תלת-ממדיים (Blender)

דורש Blender 4.x ו-Pillow. הרינדור על CPU, בלי denoiser (ה-build של Ubuntu בלעדיו).

## אייקוני האפליקציה (כל המטבעות)

    blender -b -P scripts/blender/coin.py -- --all /tmp/icons_raw 512 72 0.5
    python3 scripts/blender/compose_icons.py /tmp/icons_raw

השלב הראשון מרנדר מטבע לכל וריאנט ב-`SYMBOLS` (אותו מיפוי כמו `scripts/gen-currency-icons.py`;
וריאנט חדש מוסיפים בשני המקומות) ואפשר להמשיך ריצה שנקטעה. השלב השני מרכיב:

- `assets/icons3d/<KEY>_fg.webp` - חזית אייקון אדפטיבי, ו-`<KEY>_legacy.webp` - אנדרואיד 7
  (ש-`android-plugin/apply-currency-icons.py` מעתיק ל-res בבניית ה-APK; בלי הקבצים הוא נופל חזרה לווקטור)
- `public/icons/<KEY>.png` - ה-favicon של האתר (`src-react/lib/appIcon.js`)

## מטבע בודד (למשל מסך הטעינה)

    blender -b -P scripts/blender/coin.py -- out.png 768 100 "★" 0.7

פרמטרים: קובץ פלט, רזולוציה, דגימות, סימן על המטבע, עוצמת הנטייה (0-1).
`public/coin.webp` (מסך הטעינה) מרונדר עם "★"; `assets/coin-ils-512.webp` עם "₪".

## מטילי "אני חייב" / "חייבים לי"

    blender -b -P scripts/blender/bar.py -- --all /tmp/bars_raw
    python3 scripts/blender/compose_bars.py /tmp/bars_raw

מרנדר 6 מטילים (הורים/נוער/ילדים x זהב/נחושת) ל-`public/bars/*.webp`, שנקבעים ב-CSS (`.sum::before` להורים ולנוער,
`border-image` לילדים). מטיל הורים/נוער בהטלה אלכסונית באותה גיאומטריה של ה-viewBox 202x124 של `GoldBarArt`
(אחרת הטקסט לא יישב על החזית); צבעי המתכת הם משתני `--g-*` של כל תפקיד ב-style.css.

## אייקוני ממשק (במקום אימוג'י)

    blender -b -P scripts/blender/icons.py -- --all /tmp/ui_raw 512 64
    python3 scripts/blender/compose_ui_icons.py /tmp/ui_raw

מרנדר ל-`public/ui/*.webp` (חיתוך לריבוע, 256px), ומוצגים דרך `src-react/components/shared/UiIcon.jsx`:
`fly-money` (שטר עם כנפיים, "אני חייב") ו-`handshake` (לחיצת יד, "חייבים לי"). אייקון חדש: מוסיפים פונקציית בנייה
ב-`BUILDERS` (ומרחק מצלמה ב-`DIST`) ב-`icons.py`, ומרנדרים מחדש. אל תשכחו להוסיף אותו גם ל-`public/sw.js` ול-`preloadImages.js`.
