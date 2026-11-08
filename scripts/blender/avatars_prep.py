#!/usr/bin/env python3
"""שלב 1 לאווטארים מפלסטלינה: מפת גובה ומפת צבע מכל אימוג'י של הדמויות (AVATARS ו-PARENT_AVATARS ב-state.js).

    python3 scripts/blender/avatars_prep.py /tmp/avatars_maps /path/to/noto-emoji/2D/png/512

הצבע והצורה באים מתמונות Noto Color Emoji (2D/png/512 בריפו googlefonts/noto-emoji, רישיון Apache 2.0).
הצללית הופכת לכרית רכה עם דופן עגולה, והפרטים הפנימיים (עיניים, פה) נהיים בליטות קטנות.
דורש numpy, scipy ו-Pillow. לא נוגע באייקונים הקיימים.
"""
import os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
N, FIT = 512, 430


def avatar_lists():
    src = open(os.path.join(ROOT, 'src-react/state/state.js'), encoding='utf-8').read()
    out = []
    for name in ('AVATARS', 'PARENT_AVATARS'):
        body = re.search(r'export const %s = \[(.*?)\n\];' % name, src, re.S).group(1)
        out += re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', body))
    return out


def cps(ch):
    return [ord(x) for x in ch if ord(x) != 0xFE0F]


def key_of(ch):
    """שם הקובץ של דמות: הקודים בהקסה, מופרדים ב-'-', בלי FE0F (למשל 1f43b-200d-2744)."""
    return '-'.join('%x' % c for c in cps(ch))


def prep(ch, src_dir, outdir):
    key = key_of(ch)
    im = Image.open(os.path.join(src_dir, 'emoji_u' + '_'.join('%x' % c for c in cps(ch)) + '.png')).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
    s = FIT / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    canvas.paste(im, ((N - im.width) // 2, (N - im.height) // 2))
    a = np.asarray(canvas).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    mask = ndi.binary_opening(ndi.binary_closing(alpha > 0.5, iterations=2), iterations=1)
    # ממלאים את השקוף בצבע הקרוב, כדי שלא יהיו שוליים כהים
    idx = ndi.distance_transform_edt(~(alpha > 0.5), return_distances=False, return_indices=True)
    rgb = rgb[idx[0], idx[1]]
    rgb = np.stack([ndi.gaussian_filter(rgb[..., i], 0.9) for i in range(3)], -1)
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    rgb = np.clip(lum[..., None] + (rgb - lum[..., None]) * 1.08, 0, 1) * 0.92 + 0.06  # פלסטלינה: צבע מעט רך ועמוק
    d = ndi.gaussian_filter(ndi.distance_transform_edt(mask), 1.5)
    t = np.clip(d / 40.0, 0, 1)
    prof = np.sqrt(1 - (1 - t) ** 2)  # דופן עגולה
    dome = (d / max(d.max(), 1)) ** 0.8  # בליטה כללית של הכרית
    detail = np.clip((ndi.gaussian_filter(lum, 1.4) - ndi.gaussian_filter(lum, 7.0)) / 0.35, -1, 1)
    h = np.clip(0.62 * prof + 0.38 * dome + 0.06 * detail * (t > 0.6), 0, 1) * mask
    h = ndi.gaussian_filter(h, 0.8) * mask
    os.makedirs(outdir, exist_ok=True)
    Image.fromarray((h * 65535).astype(np.uint16)).save(os.path.join(outdir, key + '_h.png'))
    col = np.dstack([rgb, ndi.gaussian_filter(mask.astype(np.float32), 0.7)])
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(outdir, key + '_c.png'))
    return key


if __name__ == '__main__':
    out, src_dir = sys.argv[1], sys.argv[2]
    keys = [prep(ch, src_dir, out) for ch in avatar_lists()]
    open(os.path.join(out, 'keys.txt'), 'w').write('\n'.join(keys) + '\n')
    print('prep', len(keys), 'avatars')
