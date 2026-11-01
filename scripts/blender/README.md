# מטבע תלת-ממדי (Blender)

מרנדר את המטבע של האפליקציה. דורש Blender 4.x.

    blender -b -P scripts/blender/coin.py -- out.png 768 100 "★" 0.7

פרמטרים: קובץ פלט, רזולוציה, דגימות (Cycles CPU), סימן על המטבע, עוצמת הנטייה (0-1).
`public/coin.webp` (מסך הטעינה) מרונדר עם "★"; `assets/coin-ils-512.webp` עם "₪".
אחרי הרינדור: חיתוך לריבוע לפי ה-alpha והמרה ל-WebP.
