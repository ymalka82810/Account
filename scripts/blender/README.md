# מטבע תלת-ממדי (Blender)

מרנדר את המטבע של האפליקציה. דורש Blender 4.x.

    blender -b -P scripts/blender/coin.py -- out.png 768 100 "★" 0.7

פרמטרים: קובץ פלט, רזולוציה, דגימות (Cycles CPU), סימן על המטבע, עוצמת הנטייה (0-1).
`public/coin.webp` (מסך הטעינה) מרונדר עם "★"; `assets/coin-ils-512.webp` עם "₪".
אחרי הרינדור: חיתוך לריבוע לפי ה-alpha והמרה ל-WebP.

## מטילי "אני חייב" / "חייבים לי"

    blender -b -P scripts/blender/bar.py -- --all /tmp/bars_raw
    python3 scripts/blender/compose_bars.py /tmp/bars_raw

מרנדר 6 מטילים (הורים/נוער/ילדים x זהב/נחושת) ל-`public/bars/*.webp`, שנקבעים ב-CSS (`.sum::before` להורים ולנוער,
`border-image` לילדים). מטיל הורים/נוער בהטלה אלכסונית באותה גיאומטריה של ה-viewBox 202x124 של `GoldBarArt`
(אחרת הטקסט לא יישב על החזית); צבעי המתכת הם משתני `--g-*` של כל תפקיד ב-style.css.
