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

    python3 scripts/blender/make_textures.py        (רק אחרי שינוי טקסטורה; הן שמורות ב-tex/)
    blender -b -P scripts/blender/icons.py -- --all /tmp/ui_raw 512 128
    python3 scripts/blender/compose_ui_icons.py /tmp/ui_raw

הסגנון הוא מתכת כמו מטבע האפליקציה (`coin.py`): אותם חומרי זהב, אותה סביבה ואותה תאורה. השק, השטר, המגילה
והפנקס הם חפצים מזהב (כנפי השטר מכסף, החותמת והסימנייה מנחושת). הטקסטורות מ-`make_textures.py` משמשות
כחריטה: הבהיר בולט ומבריק, הכהה שקוע ומט. לחיצת היד והמשפחה הן מדליונים עם תבליט, כמו הסמל על המטבע, מצורות
הגופן Noto Emoji (`fonts/`, רישיון OFL, משקל 700, רק התווים שבשימוש). הפלט: `public/ui/*.webp` (256px), שמוצגים
דרך `src-react/components/shared/UiIcon.jsx`: `fly-money` ("אני חייב"), `handshake` ("חייבים לי" וחברים),
`money-bag` (הכסף שלי), `scroll` (מה היה), `notebook` (הפנקס), `family` (המשפחה). `withIcons(text)` מחליף את
האימוג'י התואם בתוך טקסט מתורגם, בלי לגעת בקבצי התרגום. אחרי רינדור מחדש מעלים את `UI_ICON_VERSION`
ב-`src-react/lib/uiIcons.js` ואת `?v=` ב-`public/sw.js`.

אייקוני ה"החשבון שלי" וההגדרות (`gear`, `check`, `trash`, `bell`, `bell-off`, `key`, `phone`, `mail`, `plus`, `home`,
`person`, `palette`, `eye`) הם צורות פשוטות מזהב/כסף/נחושת שנקראות גם ב-42px. אפשר לרנדר רק חלק מהאייקונים
(ובלי לגעת בקיימים) עם רשימה אחרי הדגימות: `-- --all /tmp/ui_raw 512 128 gear,check`.

אייקון חדש: פונקציית בנייה ב-`BUILDERS` ב-`icons.py`, ואז להוסיף אותו גם ל-`public/sw.js` ול-`preloadImages.js`.
רינדור על מעבד אחד: כ-20-90 שניות לאייקון ב-512/128.

## דמויות פלסטלינה (אווטארים)

הדמויות לבחירת המשתמש (`AVATARS` ו-`PARENT_AVATARS` ב-`src-react/state/state.js`) מרונדרות בסגנון פלסטלינה (כמו אארדמן),
בנפרד לגמרי מהאייקונים המתכתיים למעלה. הצורה והצבע באים מתמונות Noto Color Emoji (`2D/png/512` בריפו
`googlefonts/noto-emoji`, רישיון Apache 2.0), שהופכות לכרית רכה עם דופן עגולה וגרגר של טביעות אצבע:

    git clone --depth 1 --filter=blob:none --sparse https://github.com/googlefonts/noto-emoji.git /tmp/noto-emoji
    git -C /tmp/noto-emoji sparse-checkout set 2D/png/512
    python3 scripts/blender/avatars_prep.py /tmp/avatars_maps /tmp/noto-emoji/2D/png/512
    blender -b -P scripts/blender/avatars.py -- /tmp/avatars_maps /tmp/avatars_raw 256 40
    python3 scripts/blender/compose_avatars.py /tmp/avatars_raw

הפלט: `public/avatars/<key>.webp` (192px, שקוף), כש-`<key>` הוא קודי האימוג'י בהקסה מופרדים ב-`-` בלי FE0F
(למשל `1f98a` לשועל, `1f43b-200d-2744` לדוב קוטב). `src-react/components/shared/Avatar.jsx` מציג את התמונה, וערך
שאינו ברשימה (דמות ישנה, ברירת מחדל) נשאר אימוג'י. דמות חדשה: מוסיפים אותה ל-`state.js` ומריצים את שלושת השלבים
(הרינדור מדלג על קבצים שכבר קיימים). רינדור על מעבד אחד: כ-15 שניות לדמות.
