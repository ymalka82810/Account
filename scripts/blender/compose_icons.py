#!/usr/bin/env python3
"""מרכיב את רינדורי בלנדר (coin.py --all) לקובצי האייקון בפועל. דורש Pillow.

    python3 scripts/blender/compose_icons.py /path/to/icons_raw

פלט:
  assets/icons3d/<KEY>_fg.webp      חזית אייקון אדפטיבי (432px, שקוף) - בשימוש android-plugin/apply-currency-icons.py
  assets/icons3d/<KEY>_legacy.webp  אייקון מלא עם רקע (192px) לאנדרואיד 7
  public/icons/<KEY>.png            favicon של האתר (128px)
"""
import os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
BG_TOP, BG_BOTTOM = (0x2a, 0x3e, 0x73), (0x15, 0x20, 0x3d)


def tight(im):
    im = im.convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    c = im.crop(bb)
    # העצמה קלה של הזהב (הרינדור בלי denoiser יוצא מעט עמום)
    a = c.getchannel('A')
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(c.convert('RGB')).enhance(1.35)).enhance(1.12)
    c = rgb.convert('RGBA')
    c.putalpha(a)
    s = max(c.size)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(c, ((s - c.width) // 2, (s - c.height) // 2))
    return sq


def with_shadow(canvas_size, coin, diameter, dy_frac=0.035):
    """המטבע במרכז הקנבס עם צל רך מתחתיו."""
    c = coin.resize((diameter, diameter), Image.LANCZOS)
    layer = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - diameter) // 2
    y = (canvas_size - diameter) // 2
    dy = int(canvas_size * dy_frac)
    sh = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((x + diameter * .08, y + diameter * .12 + dy, x + diameter * .92, y + diameter * .98 + dy),
                               fill=(0, 0, 0, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(canvas_size * 0.018))
    layer.alpha_composite(sh)
    layer.alpha_composite(c, (x, y))
    return layer


def background(size, radius_frac=96 / 512):
    g = Image.new('RGBA', (size, size))
    px = g.load()
    for yy in range(size):
        t = yy / (size - 1)
        col = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)) + (255,)
        for xx in range(size):
            px[xx, yy] = col
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_frac), fill=255)
    g.putalpha(mask)
    return g


def main(raw):
    os.makedirs(os.path.join(ROOT, 'assets/icons3d'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'public/icons'), exist_ok=True)
    for fn in sorted(os.listdir(raw)):
        if not fn.endswith('.png'):
            continue
        key = fn[:-4]
        coin = tight(Image.open(os.path.join(raw, fn)))
        # אדפטיבי: קנבס 432 (108dp), קוטר המטבע 252 (63dp) בתוך האזור הבטוח של 66dp
        with_shadow(432, coin, 252).save(os.path.join(ROOT, f'assets/icons3d/{key}_fg.webp'), quality=92, method=6)
        for size, dst, dia in ((192, f'assets/icons3d/{key}_legacy.webp', 0.70), (128, f'public/icons/{key}.png', 0.72)):
            icon = background(size)
            icon.alpha_composite(with_shadow(size, coin, round(size * dia)))
            if dst.endswith('.webp'):
                icon.save(os.path.join(ROOT, dst), quality=92, method=6)
            else:
                icon.save(os.path.join(ROOT, dst), optimize=True)
        print('composed', key)


if __name__ == '__main__':
    main(sys.argv[1])
