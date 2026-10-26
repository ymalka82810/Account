// מחלץ את כל מפתחות התרגום (נוסח עברי) מהקוד:
//   - src-react: t('...'), tn(n, 'אחד', 'רבים'), g/gw(מגדר, 'זכר', 'נקבה', 'כפול')
//   - convex: הודעות ConvexError שהלקוח מתרגם ב-errMsg
// כותב את scripts/i18n/keys.json. עם --check בודק שלכל שפה ב-src-react/i18n/locales יש תרגום לכל מפתח.
//   node scripts/i18n-extract.mjs            # מחלץ
//   node scripts/i18n-extract.mjs --check    # בודק כיסוי (יוצא עם שגיאה אם חסר)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HEB = /[֐-׿]/;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// קורא מחרוזת JS מ-src[i] (מרכאה ' " או `), מחזיר [ערך, אינדקס אחרי הסוגר] או null.
function readString(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      const n = src[j + 1];
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      j++;
    } else if (c === q) return [out, j + 1];
    else if (q === '`' && c === '$' && src[j + 1] === '{') return null; // תבנית עם ביטוי: לא מפתח
    else out += c;
  }
  return null;
}

// מפרק את הארגומנטים של קריאה שמתחילה ב-src[open] === '('. מחזיר מערך של {str?, end}.
function readArgs(src, open) {
  const args = [];
  let i = open + 1;
  let depth = 0;
  let start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      // דילוג על מחרוזת (כולל תבניות עם ${})
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === c) break;
      }
      i = j;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { args.push(src.slice(start, i).trim()); return args; }
      depth--;
    } else if (c === ',' && depth === 0) { args.push(src.slice(start, i).trim()); start = i + 1; }
  }
  return args;
}

const strArg = (a) => { const r = a ? readString(a, 0) : null; return r && r[1] === a.length ? r[0] : null; };

const keys = new Set();
const add = (k) => { if (k && HEB.test(k)) keys.add(k); };

for (const file of walk('src-react').filter((f) => /\.(jsx?|tsx?)$/.test(f) && !f.includes(join('src-react', 'i18n')))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?<![\w$.])(t|tn|g|gw)\(/g)) {
    const args = readArgs(src, m.index + m[0].length - 1);
    if (m[1] === 't') add(strArg(args[0]));
    else if (m[1] === 'tn') { const a = strArg(args[1]); const b = strArg(args[2]); if (a && b) add(`${a}|${b}`); }
    else for (const a of args.slice(1, 4)) add(strArg(a));
  }
  // vw/owesLine וכד' משתמשים ב-g, ולכן נכללים. t דרך this.t לא קיים.
}

// הודעות שרת (ConvexError) - הלקוח מתרגם אותן במפתח עברי
for (const file of walk('convex').filter((f) => f.endsWith('.ts') && !f.includes('_generated'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/ConvexError\(/g)) {
    const args = readArgs(src, m.index + m[0].length - 1);
    const s = strArg(args[0]);
    if (s) add(s);
  }
}
// הודעות עם פרמטרים מ-serverMessages.js
const sm = readFileSync('src-react/i18n/serverMessages.js', 'utf8');
for (const m of sm.matchAll(/,\s*('[^']*'),\s*\[/g)) add(readString(m[1], 0)[0]);
add('הקוד צריך להיות 4 ספרות');
add('משהו השתבש. נסו שוב.');

const sorted = [...keys].sort((a, b) => a.localeCompare(b, 'he'));

if (process.argv.includes('--check')) {
  const dir = 'src-react/i18n/locales';
  let bad = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const missing = sorted.filter((k) => !(k in d) || d[k] === '' || d[k] == null);
    const extra = Object.keys(d).filter((k) => !keys.has(k));
    if (missing.length || extra.length) {
      bad++;
      console.log(`${f}: חסרים ${missing.length}, מיותרים ${extra.length}`);
      missing.slice(0, 5).forEach((k) => console.log('   חסר:', k));
      extra.slice(0, 5).forEach((k) => console.log('   מיותר:', k));
    }
  }
  console.log(bad ? `נכשל: ${bad} קבצים` : `הכול מכוסה (${sorted.length} מפתחות)`);
  process.exit(bad ? 1 : 0);
}

mkdirSync('scripts/i18n', { recursive: true });
writeFileSync('scripts/i18n/keys.json', JSON.stringify(sorted, null, 1) + '\n');
console.log(`${sorted.length} מפתחות -> scripts/i18n/keys.json`);
