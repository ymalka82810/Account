#!/usr/bin/env python3
"""
מייצר את assets/currency-icons.json: סמל המטבע של כל וריאנט של אייקון האפליקציה, כקווי מתאר (path)
בתוך מטבע הזהב, ב-viewBox של 512x512. האותיות הומרו לקווים מראש כדי שלא נהיה תלויים בגופנים
במכשיר או בשרת הבנייה. מריצים רק כשמוסיפים וריאנט (צריך fonttools וגופן DejaVu Sans Bold):
    python3 scripts/gen-currency-icons.py
את הקובץ צורכים האתר (src-react/lib/appIcon.js) ובניית ה-APK (android-plugin/apply-currency-icons.py).
"""
import json, os
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
# key: (טקסט הסמל, מטבעות)
VARIANTS = {
    'ILS': ('₪', ['ILS']),
    'USD': ('$', ['USD', 'CAD', 'AUD', 'NZD', 'HKD', 'SGD', 'MXN', 'ARS']),
    'EUR': ('€', ['EUR']),
    'GBP': ('£', ['GBP']),
    'JPY': ('¥', ['JPY', 'CNY']),
    'INR': ('₹', ['INR']),
    'RUB': ('₽', ['RUB']),
    'UAH': ('₴', ['UAH']),
    'TRY': ('₺', ['TRY']),
    'THB': ('฿', ['THB']),
    'PLN': ('zł', ['PLN']),
    'SEK': ('kr', ['SEK', 'NOK', 'DKK']),
    'CZK': ('Kč', ['CZK']),
    'HUF': ('Ft', ['HUF']),
    'CHF': ('Fr', ['CHF']),
    'ZAR': ('R', ['ZAR']),
    'BRL': ('R$', ['BRL']),
}
# הסמל חייב להיכנס בתוך הטבעת הפנימית (רדיוס ~105): אלכסון התיבה עד 180, וגובה עד 136
MAX_H, MAX_DIAG, CX, CY = 136, 180, 256, 256

font = TTFont(FONT)
gs, cmap = font.getGlyphSet(), font.getBestCmap()
hmtx = font['hmtx']

def text_path(text):
    # מיקום האותיות זו אחר זו, מדידה, ואז קנה מידה ומרכוז בתוך המטבע
    names, x, placed = [cmap[ord(c)] for c in text], 0, []
    for n in names:
        placed.append((n, x)); x += hmtx[n][0]
    bp = BoundsPen(gs)
    for n, dx in placed:
        gs[n].draw(TransformPen(bp, (1, 0, 0, 1, dx, 0)))
    x0, y0, x1, y1 = bp.bounds
    s = min(MAX_H / (y1 - y0), MAX_DIAG / ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5)
    # y של הגופן כלפי מעלה, של SVG כלפי מטה
    tx, ty = CX - s * (x0 + x1) / 2, CY + s * (y0 + y1) / 2
    sp = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    for n, dx in placed:
        gs[n].draw(TransformPen(sp, (s, 0, 0, -s, tx + s * dx, ty)))
    return sp.getCommands()

# סמלים שאין בגופנים, מצוירים ידנית באותו viewBox (מרכז 256,256, בתוך הטבעת הפנימית).
# כיוון הציור: מתאר חיצוני עם כיוון השעון וחורים נגדו (מילוי nonzero).
def aed_path(dx=-4):
    # הסמל החדש של הדירהם (2025): D עבה עם שני קווים אופקיים שחוצים אותה
    X = lambda x: ('%g' % (x + dx))
    outer = f'M{X(202)} 186H{X(266)}A70 70 0 0 1 {X(266)} 326H{X(202)}Z'
    hole = f'M{X(228)} 212V300H{X(266)}A44 44 0 0 0 {X(266)} 212Z'
    bars = ''.join(f'M{X(176)} {y - 7}H{X(344)}V{y + 7}H{X(176)}Z' for y in (238, 274))
    return outer + hole + bars

CUSTOM = {
    'AED': ('D', aed_path(), ['AED']),
}

out = {'variants': {}, 'byCurrency': {}}
for key, (text, curs) in VARIANTS.items():
    out['variants'][key] = {'symbol': text, 'path': text_path(text)}
    for c in curs:
        out['byCurrency'][c] = key
for key, (text, path, curs) in CUSTOM.items():
    out['variants'][key] = {'symbol': text, 'path': path}
    for c in curs:
        out['byCurrency'][c] = key

root = os.path.join(os.path.dirname(__file__), '..')
with open(os.path.join(root, 'assets', 'currency-icons.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('wrote', len(out['variants']), 'variants')
