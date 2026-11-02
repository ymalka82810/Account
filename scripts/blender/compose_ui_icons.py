#!/usr/bin/env python3
"""ממיר את רינדורי icons.py ל-public/ui/*.webp (חיתוך לשוליים שקופים + ריבוע). דורש Pillow.

    python3 scripts/blender/compose_ui_icons.py /path/to/ui_raw
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SIZE = 256  # הצגה עד ~64px ב-CSS, פי 4 לצפיפות גבוהה


def main(raw):
    out = os.path.join(ROOT, 'public/ui')
    os.makedirs(out, exist_ok=True)
    for fn in sorted(os.listdir(raw)):
        if not fn.endswith('.png'):
            continue
        im = Image.open(os.path.join(raw, fn)).convert('RGBA')
        im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox())
        side = int(max(im.size) * 1.04)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
        dst = os.path.join(out, fn[:-4] + '.webp')
        sq.save(dst, quality=90, method=6)
        print('ui', fn[:-4], os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
