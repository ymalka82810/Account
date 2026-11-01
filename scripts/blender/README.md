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
