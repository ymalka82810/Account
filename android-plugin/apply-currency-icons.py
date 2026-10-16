#!/usr/bin/env python3
"""
אייקון האפליקציה לפי מטבע (רץ בבניית ה-APK, אחרי npx cap add android).

לכל וריאנט ב-assets/currency-icons.json:
  - res/drawable/ic_cur_<key>_fg.xml   חזית אייקון אדפטיבי (המטבע + הסמל), וקטור
  - res/mipmap-anydpi-v26/ic_cur_<key>.xml   אייקון אדפטיבי (רקע כחול + החזית)
  - res/mipmap-anydpi/ic_cur_<key>.xml  אייקון מלא כווקטור לאנדרואיד 7 (API 24-25)
  - activity-alias בשם .Icon<KEY> במניפסט, עם intent-filter של LAUNCHER

ה-intent-filter של LAUNCHER יורד מ-MainActivity, כך שבמסך הבית מופיע תמיד רק ה-alias הפעיל.
ברירת המחדל (enabled) היא USD; AppIconPlugin.java מחליף ביניהם לפי המטבע.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android/app/src/main/res')
MANIFEST = os.path.join(ROOT, 'android/app/src/main/AndroidManifest.xml')
DEFAULT = 'USD'
# ערימת מטבעות זהב על רקע כחול. אותה גאומטריה בדיוק ב-src-react/lib/appIcon.js וב-scripts/gen-icon-svgs.py.
BACK, MID, FRONT = (256, 280, 126), (256, 260, 128), (256, 238, 130)
GOLD_BACK, GOLD_MID, RIM, ENGRAVE = '#FFA9760D', '#FFC8921A', '#FFB57F0C', '#FFA9730A'
BG_TOP, BG_BOTTOM = '#FF2A3E73', '#FF15203D'

data = json.load(open(os.path.join(ROOT, 'assets/currency-icons.json'), encoding='utf-8'))
variants = data['variants']
if DEFAULT not in variants:
    sys.exit('missing default variant ' + DEFAULT)

# עיגול ב-pathData (וקטור של אנדרואיד לא מכיר <circle>)
def circle(r, cx=256, cy=256):
    return f'M{cx - r},{cy}a{r},{r} 0 1,1 {2 * r},0a{r},{r} 0 1,1 {-2 * r},0z'

def gradient_path(path_data, x1, y1, x2, y2, stops):
    items = ''.join(f'                <item android:offset="{o}" android:color="{c}"/>\n' for o, c in stops)
    return (f'    <path android:pathData="{path_data}">\n'
            '        <aapt:attr name="android:fillColor">\n'
            f'            <gradient android:type="linear" android:startX="{x1}" android:startY="{y1}"\n'
            f'                android:endX="{x2}" android:endY="{y2}">\n'
            f'{items}'
            '            </gradient>\n'
            '        </aapt:attr>\n'
            '    </path>\n')

def coin_paths(symbol_path):
    cx, cy, r = FRONT
    body = ''
    for (bx, by, br), fill in ((BACK, GOLD_BACK), (MID, GOLD_MID)):
        body += f'    <path android:fillColor="{fill}" android:pathData="{circle(br, bx, by)}"/>\n'
    # פני המטבע הקדמי עם מדרג זהב, שפה חרוטה וטבעת פנימית
    body += gradient_path(circle(r, cx, cy), 102, 64, 410, 486,
                          (('0', '#FFFFE694'), ('0.55', '#FFF6C945'), ('1', '#FFD79F16')))
    body += (f'    <path android:strokeColor="{RIM}" android:strokeWidth="9" android:pathData="{circle(r - 6, cx, cy)}"/>\n'
             f'    <path android:strokeColor="{ENGRAVE}" android:strokeWidth="9" android:pathData="{circle(100, cx, cy)}"/>\n')
    if symbol_path:
        body += (f'    <group android:pivotX="256" android:pivotY="256" android:scaleX="0.92" android:scaleY="0.92"\n'
                 f'        android:translateY="{cy - 256}">\n'
                 f'        <path android:fillColor="{ENGRAVE}" android:pathData="{symbol_path}"/>\n'
                 '    </group>\n')
    return body

def vector(size_dp, body):
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    xmlns:aapt="http://schemas.android.com/aapt"\n'
            f'    android:width="{size_dp}dp" android:height="{size_dp}dp"\n'
            '    android:viewportWidth="512" android:viewportHeight="512">\n'
            f'{body}</vector>\n')

# האייקון הישן (אנדרואיד 7): פינות מעוגלות, בלי מסכה של המערכת, ולכן הערימה גדולה יותר
def rounded_rect(rx=96):
    return (f'M{rx},0H{512 - rx}A{rx},{rx} 0 0,1 512,{rx}V{512 - rx}A{rx},{rx} 0 0,1 {512 - rx},512'
            f'H{rx}A{rx},{rx} 0 0,1 0,{512 - rx}V{rx}A{rx},{rx} 0 0,1 {rx},0z')

def indent_block(text, extra='    '):
    return ''.join(extra + ln if ln.strip() else ln for ln in text.splitlines(True))

def legacy_body(symbol_path):
    bg = gradient_path(rounded_rect(), 256, 0, 256, 512, (('0', BG_TOP), ('1', BG_BOTTOM)))
    return (bg + '    <group android:pivotX="256" android:pivotY="256" android:scaleX="1.22" android:scaleY="1.22">\n'
            + indent_block(coin_paths(symbol_path)) + '    </group>\n')

def write(rel, text):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

aliases = []
for key, v in variants.items():
    name = 'ic_cur_' + key.lower()
    # חזית אדפטיבית: קנבס 108dp, המטבע (קוטר 300 מתוך 512 ≈ 63dp) בתוך האזור הבטוח של 66dp
    write(f'drawable/{name}_fg.xml', vector(108, coin_paths(v['path'])))
    write(f'mipmap-anydpi-v26/{name}.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n'
          '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
          f'    <background android:drawable="@drawable/ic_cur_bg"/>\n'
          f'    <foreground android:drawable="@drawable/{name}_fg"/>\n'
          '</adaptive-icon>\n')
    write(f'mipmap-anydpi/{name}.xml', vector(48, legacy_body(v['path'])))
    aliases.append(
        f'        <activity-alias\n'
        f'            android:name=".Icon{key}"\n'
        f'            android:targetActivity=".MainActivity"\n'
        f'            android:enabled="{"true" if key == DEFAULT else "false"}"\n'
        f'            android:exported="true"\n'
        f'            android:label="@string/app_name"\n'
        f'            android:icon="@mipmap/{name}"\n'
        f'            android:roundIcon="@mipmap/{name}">\n'
        f'            <intent-filter>\n'
        f'                <action android:name="android.intent.action.MAIN" />\n'
        f'                <category android:name="android.intent.category.LAUNCHER" />\n'
        f'            </intent-filter>\n'
        f'        </activity-alias>\n')

write('drawable/ic_cur_bg.xml',
      vector(108, gradient_path('M0,0h512v512h-512z', 256, 0, 256, 512, (('0', BG_TOP), ('1', BG_BOTTOM)))))

m = open(MANIFEST, encoding='utf-8').read()
act = re.search(r'<activity\b[^>]*android:name="\.MainActivity".*?</activity>\s*', m, re.S)
if not act:
    sys.exit('MainActivity not found in manifest')
block = act.group(0)
new_block, n = re.subn(r'\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"\s*/>\s*'
                       r'<category android:name="android\.intent\.category\.LAUNCHER"\s*/>\s*</intent-filter>',
                       '', block)
if n != 1:
    sys.exit('LAUNCHER intent-filter not found on MainActivity')
m = m.replace(block, new_block.rstrip() + '\n\n' + ''.join(aliases) + '\n        ')
open(MANIFEST, 'w', encoding='utf-8').write(m)
print('currency icons:', ', '.join(variants))
