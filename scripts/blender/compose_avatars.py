#!/usr/bin/env python3
"""שלב 3: ממיר את רינדורי avatars.py ל-public/avatars/<key>.webp (192px, שקוף). דורש Pillow.

    python3 scripts/blender/compose_avatars.py /tmp/avatars_raw
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SIZE = 192


def main(raw):
    out = os.path.join(ROOT, 'public/avatars')
    os.makedirs(out, exist_ok=True)
    for fn in sorted(os.listdir(raw)):
        if fn.endswith('.png'):
            im = Image.open(os.path.join(raw, fn)).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
            im.save(os.path.join(out, fn[:-4] + '.webp'), quality=88, method=6)
    print('avatars', len(os.listdir(out)))


if __name__ == '__main__':
    main(sys.argv[1])
