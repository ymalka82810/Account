#!/usr/bin/env python3
"""
מייצר את קובצי ה-SVG הסטטיים של האייקון מתוך הגדרת העיצוב האחת (ערימת מטבעות זהב על רקע כחול):
    assets/icon-background.svg  רקע האייקון האדפטיבי (ל-@capacitor/assets)
    assets/icon-foreground.svg  חזית האייקון האדפטיבי
    assets/icon-only.svg        האייקון המלא (גם למסך הפתיחה)
    public/icon.svg             favicon סטטי לפני שה-JS מחליף אותו לפי המטבע
מריצים אחרי שינוי בעיצוב:
    python3 scripts/gen-icon-svgs.py
אותה גאומטריה בדיוק קיימת גם ב-src-react/lib/appIcon.js (האתר) וב-android-plugin/apply-currency-icons.py (ה-APK).
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# ערימת המטבעות ממוקמת כך שהיא נכנסת באזור הבטוח של אייקון אדפטיבי (רדיוס 156 מתוך 512)
BACK, MID, FRONT = (256, 280, 126), (256, 260, 128), (256, 238, 130)
GOLD_BACK, GOLD_MID, RIM, ENGRAVE = '#a9760d', '#c8921a', '#b57f0c', '#a9730a'
BG_TOP, BG_BOTTOM = '#2a3e73', '#15203d'

DEFS = ('<defs>'
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOTTOM}"/></linearGradient>'
        '<linearGradient id="gold" x1="0.15" y1="0.08" x2="0.8" y2="0.95">'
        '<stop offset="0" stop-color="#ffe694"/><stop offset="0.55" stop-color="#f6c945"/>'
        '<stop offset="1" stop-color="#d79f16"/></linearGradient></defs>')


def coins(symbol_path=None, scale=1.0):
    """ערימת המטבעות: שני מטבעות מאחור, המטבע הקדמי עם טבעת חרוטה וסמל המטבע."""
    g = ''
    for (cx, cy, r), fill in ((BACK, GOLD_BACK), (MID, GOLD_MID)):
        g += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
    cx, cy, r = FRONT
    g += (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#gold)"/>'
          f'<circle cx="{cx}" cy="{cy}" r="{r - 6}" fill="none" stroke="{RIM}" stroke-width="9"/>'
          f'<circle cx="{cx}" cy="{cy}" r="100" fill="none" stroke="{ENGRAVE}" stroke-width="9"/>')
    if symbol_path:
        g += (f'<g transform="translate(0 {cy - 256}) translate(256 256) scale(0.92) translate(-256 -256)">'
              f'<path d="{symbol_path}" fill="{ENGRAVE}"/></g>')
    if scale != 1.0:
        g = f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">{g}</g>'
    return g


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}{body}</svg>\n'


def write(rel, text):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(text)


ils = json.load(open(os.path.join(ROOT, 'assets/currency-icons.json'), encoding='utf-8'))['variants']['ILS']['path']

write('assets/icon-background.svg', svg('<rect width="512" height="512" fill="url(#bg)"/>'))
write('assets/icon-foreground.svg', svg(coins()))
write('assets/icon-only.svg', svg('<rect width="512" height="512" fill="url(#bg)"/>' + coins(scale=1.22)))
write('public/icon.svg', svg('<rect width="512" height="512" rx="96" fill="url(#bg)"/>' + coins(ils, scale=1.22)))
print('wrote icon svgs')
