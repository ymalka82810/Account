#!/usr/bin/env python3
"""ממיר את רינדורי bar.py ל-public/bars/*.webp. דורש Pillow.

    python3 scripts/blender/compose_bars.py /path/to/bars_raw

מטילי הורים/נוער נשארים בקנבס המלא (הוא ממופה ל-viewBox 202x124 של GoldBarArt). מטילי הילדים נחתכים
לקצוות המטיל, כי הם משמשים כ-border-image (9-slice) ב-CSS.
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def main(raw):
    out = os.path.join(ROOT, 'public/bars')
    os.makedirs(out, exist_ok=True)
    for fn in sorted(os.listdir(raw)):
        if not fn.endswith('.png'):
            continue
        name = fn[:-4]
        im = Image.open(os.path.join(raw, fn)).convert('RGBA')
        if name.startswith('child-'):
            im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox())
        im.save(os.path.join(out, name + '.webp'), quality=90, method=6)
        print('bar', name, im.size, os.path.getsize(os.path.join(out, name + '.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
