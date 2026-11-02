#!/usr/bin/env python3
"""צובע מחדש את מטילי "אני חייב" / "חייבים לי" של הילדים והנוער לפי ערכות הצבעים.

המקור: מטילי הזהב שרונדרו ב-Blender (scripts/bars-src, ראו scripts/blender/bar.py). כאן מסובבים את הגוון
(ההבהרות והצללים נשארים) ונוצרים:
  public/bars/child-{get,owe}.webp               ילדים: תכלת (חייבים לי) וורוד (אני חייב), כמו כותרת הילדים
  public/bars/teen-{blue,green,orange}-{get,owe}.webp   נוער: לפי ערכת הניאון שנבחרה
הרצה: python3 scripts/recolor-bars.py   (דורש Pillow ו-numpy)
"""
import colorsys
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'bars-src')
OUT = os.path.join(ROOT, 'public', 'bars')

# (קובץ מקור, קובץ יעד, גוון יעד במעלות, הכפלת רוויה)
JOBS = [
    ('child-get', 'child-get', 200, 1.0),
    ('child-owe', 'child-owe', 335, 1.0),
    ('teen-get', 'teen-blue-get', 190, 1.1),
    ('teen-owe', 'teen-blue-owe', 280, 1.2),
    ('teen-get', 'teen-green-get', 140, 1.1),
    ('teen-owe', 'teen-green-owe', 65, 1.35),
    ('teen-get', 'teen-orange-get', 25, 1.05),
    ('teen-owe', 'teen-orange-owe', 325, 1.2),
]


def mean_hue(rgb, alpha):
    """גוון ממוצע (מעלות) של פיקסלים אטומים, ממושקל לפי רוויה."""
    px = rgb[alpha > 200][::7] / 255.0
    sx = sy = 0.0
    for r, g, b in px:
        h, s, _ = colorsys.rgb_to_hsv(r, g, b)
        sx += math.cos(h * 2 * math.pi) * s
        sy += math.sin(h * 2 * math.pi) * s
    return math.degrees(math.atan2(sy, sx)) % 360


def recolor(src, dst, hue, sat):
    im = Image.open(os.path.join(SRC, src + '.webp')).convert('RGBA')
    arr = np.array(im)
    alpha = arr[..., 3]
    delta = (hue - mean_hue(arr[..., :3], alpha)) / 360.0 * 255.0
    hsv = np.array(Image.fromarray(arr[..., :3], 'RGB').convert('HSV')).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + delta) % 256
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    rgb = np.array(Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB'))
    Image.fromarray(np.dstack([rgb, alpha]), 'RGBA').save(os.path.join(OUT, dst + '.webp'), quality=92, method=6)


if __name__ == '__main__':
    for job in JOBS:
        recolor(*job)
        print('נוצר', job[1])
