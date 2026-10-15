#!/usr/bin/env python3
"""
אייקון האפליקציה לפי מטבע (רץ בבניית ה-APK, אחרי npx cap add android).

לכל וריאנט ב-assets/currency-icons.json:
  - res/drawable/ic_cur_<key>_fg.xml   חזית אייקון אדפטיבי (המטבע + הסמל), וקטור
  - res/mipmap-anydpi-v26/ic_cur_<key>.xml   אייקון אדפטיבי (רקע כחול + החזית)
  - res/mipmap-anydpi/ic_cur_<key>.xml  אייקון מלא כווקטור לאנדרואיד 7 (API 24-25)
  - activity-alias בשם .Icon<KEY> במניפסט, עם intent-filter של LAUNCHER

ה-intent-filter של LAUNCHER יורד מ-MainActivity, כך שבמסך הבית מופיע תמיד רק ה-alias הפעיל.
ברירת המחדל (enabled) היא ILS; AppIconPlugin.java מחליף ביניהם לפי המטבע.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android/app/src/main/res')
MANIFEST = os.path.join(ROOT, 'android/app/src/main/AndroidManifest.xml')
DEFAULT = 'ILS'
BG, GOLD, DARK = '#FF1D2B4F', '#FFF6C945', '#FFC99A0F'

data = json.load(open(os.path.join(ROOT, 'assets/currency-icons.json'), encoding='utf-8'))
variants = data['variants']
if DEFAULT not in variants:
    sys.exit('missing default variant ' + DEFAULT)

# עיגול ב-pathData (וקטור של אנדרואיד לא מכיר <circle>)
def circle(r, cx=256, cy=256):
    return f'M{cx - r},{cy}a{r},{r} 0 1,1 {2 * r},0a{r},{r} 0 1,1 {-2 * r},0z'

def coin_paths(symbol_path):
    return (f'    <path android:fillColor="{GOLD}" android:pathData="{circle(150)}"/>\n'
            f'    <path android:strokeColor="{DARK}" android:strokeWidth="14" android:pathData="{circle(112)}"/>\n'
            + (f'    <path android:fillColor="{DARK}" android:pathData="{symbol_path}"/>\n' if symbol_path else ''))

def vector(size_dp, body):
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            f'    android:width="{size_dp}dp" android:height="{size_dp}dp"\n'
            '    android:viewportWidth="512" android:viewportHeight="512">\n'
            f'{body}</vector>\n')

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
          f'    <background android:drawable="@color/ic_cur_bg"/>\n'
          f'    <foreground android:drawable="@drawable/{name}_fg"/>\n'
          '</adaptive-icon>\n')
    write(f'mipmap-anydpi/{name}.xml',
          vector(48, f'    <path android:fillColor="{BG}" android:pathData="M0,0h512v512h-512z"/>\n' + coin_paths(v['path'])))
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

write('values/ic_cur_colors.xml',
      f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_cur_bg">{BG}</color>\n</resources>\n')

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
