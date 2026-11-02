#!/usr/bin/env python3
"""מצייר את הטקסטורות של אייקוני הממשק (שטר, מגילה, כריכת פנקס) ל-scripts/blender/tex/. דורש Pillow ו-numpy.

    python3 scripts/blender/make_textures.py

icons.py טוען אותן משם. הטקסטורות נשמרות ב-git, כך שאין צורך להריץ את זה לפני כל רינדור.
"""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'tex')
BOLD = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
SYM = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def gradient(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None, None]
    a = np.array(top, float)[None, None, :]
    b = np.array(bottom, float)[None, None, :]
    return Image.fromarray(np.repeat((a + (b - a) * t).astype(np.uint8), w, axis=1))


def noise(im, amount, seed, blur=1.2):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amount, (im.height, im.width, 1))
    n = np.array(Image.fromarray(((n[..., 0] + 128).clip(0, 255)).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)), float)[..., None] - 128
    arr = np.array(im, float)
    arr[..., :3] = (arr[..., :3] + n).clip(0, 255)
    return Image.fromarray(arr.astype(np.uint8))


def rrect(d, box, r, **kw):
    d.rounded_rectangle(box, r, **kw)


# ------------------------------------------------------------------ שטר
def banknote():
    W, H = 1400, 700
    im = gradient(W, H, (126, 214, 150), (64, 168, 104)).convert('RGBA')
    d = ImageDraw.Draw(im)
    # גיליוש: גלים עדינים לכל הרוחב
    for k in range(26):
        pts = [(x, H / 2 + (k - 13) * 26 + 18 * math.sin(x / 70 + k * 0.6)) for x in range(0, W + 10, 10)]
        d.line(pts, fill=(255, 255, 255, 34), width=3)
    # מסגרת כפולה
    rrect(d, (28, 28, W - 28, H - 28), 46, outline=(236, 255, 236, 255), width=14)
    rrect(d, (62, 62, W - 62, H - 62), 30, outline=(40, 128, 78, 255), width=6)
    # מדליון מרכזי
    cx, cy, R = W // 2, H // 2, 205
    for i, (r, col) in enumerate([(R + 22, (40, 128, 78, 255)), (R, (236, 255, 236, 255)), (R - 22, (88, 190, 124, 255))]):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    for a in range(0, 360, 10):  # שמש של קווים
        x = cx + (R - 30) * math.cos(math.radians(a)); y = cy + (R - 30) * math.sin(math.radians(a))
        d.line((cx, cy, x, y), fill=(255, 255, 255, 40), width=4)
    d.ellipse((cx - 120, cy - 120, cx + 120, cy + 120), fill=(255, 214, 92, 255), outline=(201, 140, 20, 255), width=10)
    f = ImageFont.truetype(SYM, 170)
    d.text((cx, cy + 6), '★', font=f, fill=(201, 140, 20, 255), anchor='mm')
    # ספרות בפינות
    f2 = ImageFont.truetype(BOLD, 112)
    for (x, y) in ((150, 150), (W - 150, H - 150)):
        d.ellipse((x - 86, y - 86, x + 86, y + 86), fill=(236, 255, 236, 255))
        d.text((x, y + 8), '100', font=ImageFont.truetype(BOLD, 64), fill=(40, 128, 78, 255), anchor='mm')
    for (x, y) in ((W - 210, 175), (210, H - 175)):
        d.text((x, y), '100', font=f2, fill=(236, 255, 236, 200), anchor='mm')
    im = noise(im, 10, 1)
    im.convert('RGB').save(os.path.join(OUT, 'banknote.jpg'), quality=90)


# ------------------------------------------------------------------ מגילה (פנקס היסטוריה)
def scroll():
    W, H = 900, 1500
    im = gradient(W, H, (253, 241, 205), (243, 222, 170)).convert('RGBA')
    # כתמי זמן וקצוות כהים
    v = Image.new('L', (W, H), 0)
    vd = ImageDraw.Draw(v)
    vd.rectangle((60, 40, W - 60, H - 40), fill=255)
    v = v.filter(ImageFilter.GaussianBlur(70))
    dark = Image.new('RGBA', (W, H), (196, 150, 84, 255))
    im = Image.composite(im, dark, v)
    d = ImageDraw.Draw(im)
    ink, plus, minus = (96, 64, 36, 255), (46, 150, 88, 255), (214, 84, 62, 255)
    rng = random.Random(4)
    # כותרת: קו עבה וקו דק
    d.rounded_rectangle((150, 170, W - 150, 214), 22, fill=ink)
    d.line((150, 262, W - 150, 262), fill=(150, 112, 70, 255), width=6)
    y = 340
    for i in range(8):
        sign = '+' if i % 3 != 1 else '−'
        col = plus if sign == '+' else minus
        d.ellipse((150, y - 24, 198, y + 24), fill=col)
        d.text((174, y + 2), sign, font=ImageFont.truetype(BOLD, 56), fill=(255, 255, 255, 255), anchor='mm')
        L = rng.randint(220, 380)
        d.rounded_rectangle((232, y - 11, 232 + L, y + 11), 11, fill=ink)
        amt = str(rng.choice([5, 10, 12, 20, 25, 40, 50]))
        d.text((W - 150, y + 4), amt, font=ImageFont.truetype(BOLD, 64), fill=col, anchor='rm')
        y += 128
    d.line((150, y - 40, W - 150, y - 40), fill=(150, 112, 70, 255), width=6)
    im = noise(im, 9, 2, 1.5)
    im.convert('RGB').save(os.path.join(OUT, 'scroll.jpg'), quality=90)


# ------------------------------------------------------------------ כריכת פנקס
def notebook():
    W, H = 1000, 1300
    im = gradient(W, H, (84, 132, 246), (44, 84, 200)).convert('RGBA')
    im = noise(im, 14, 3, 0.8)  # מרקם בד
    d = ImageDraw.Draw(im)
    # תפר מקווקו
    def dashed(box, r):
        x0, y0, x1, y1 = box
        segs = []
        for x in range(x0 + r, x1 - r, 34):
            segs += [((x, y0), (x + 18, y0)), ((x, y1), (x + 18, y1))]
        for y in range(y0 + r, y1 - r, 34):
            segs += [((x0, y), (x0, y + 18)), ((x1, y), (x1, y + 18))]
        for a, b in segs:
            d.line((a, b), fill=(255, 236, 170, 255), width=7)
    dashed((150, 60, W - 60, H - 60), 30)
    # תווית
    rrect(d, (290, 240, W - 190, 560), 40, fill=(255, 250, 236, 255))
    rrect(d, (290, 240, W - 190, 560), 40, outline=(226, 206, 160, 255), width=6)
    d.rounded_rectangle((350, 320, W - 250, 362), 21, fill=(70, 110, 220, 255))
    d.rounded_rectangle((350, 420, W - 380, 452), 16, fill=(170, 190, 236, 255))
    # מדבקת מטבע
    cx, cy = 600, 900
    d.ellipse((cx - 170, cy - 170, cx + 170, cy + 170), fill=(255, 255, 255, 255))
    d.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), fill=(255, 205, 70, 255), outline=(206, 140, 18, 255), width=12)
    d.text((cx, cy + 8), '★', font=ImageFont.truetype(SYM, 190), fill=(206, 140, 18, 255), anchor='mm')
    im.convert('RGB').save(os.path.join(OUT, 'notebook.jpg'), quality=90)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    banknote(); scroll(); notebook()
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
