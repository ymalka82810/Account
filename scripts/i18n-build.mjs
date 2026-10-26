// בונה את src-react/i18n/locales/<שפה>.json מקובצי התרגום scripts/i18n/translations/<שפה>.txt.
// כל שורה: "<אינדקס>|<תרגום>" לפי הסדר ב-scripts/i18n/keys.json (npm run i18n:extract מייצר אותו).
// "\n" בתרגום הופך לירידת שורה. מפתחות ריבוי (עם "|" במפתח) אפשר לתרגם כ-JSON: {"one":"..","other":".."}.
// הבנייה מאמתת שלכל אינדקס יש תרגום, ושקבוצת ה-{placeholders} זהה למפתח, כדי לתפוס הזזות ושגיאות.
//   node scripts/i18n-build.mjs            # כל השפות
//   node scripts/i18n-build.mjs en fr      # שפות מסוימות
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const keys = JSON.parse(readFileSync('scripts/i18n/keys.json', 'utf8'));
const dir = 'scripts/i18n/translations';
const out = 'src-react/i18n/locales';
mkdirSync(out, { recursive: true });

const names = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
const wanted = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.txt') && (!wanted.length || wanted.includes(f.slice(0, -4))));
let failed = 0;

for (const f of files) {
  const lang = f.slice(0, -4);
  const lines = readFileSync(`${dir}/${f}`, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const dict = {};
  const errors = [];
  const seen = new Set();
  for (const line of lines) {
    const bar = line.indexOf('|');
    const idx = Number(line.slice(0, bar));
    if (bar < 1 || !Number.isInteger(idx) || idx < 0 || idx >= keys.length) { errors.push(`שורה לא תקינה: ${line.slice(0, 60)}`); continue; }
    if (seen.has(idx)) { errors.push(`אינדקס כפול ${idx}`); continue; }
    seen.add(idx);
    const key = keys[idx];
    let text = line.slice(bar + 1).replace(/\\n/g, '\n');
    let value = text;
    if (key.includes('|') && text.trim().startsWith('{')) {
      try { value = JSON.parse(text); } catch { errors.push(`${idx}: JSON לא תקין`); continue; }
    }
    const all = typeof value === 'string' ? value : Object.values(value).join(' ');
    // בשפה ללא ריבוי אפשר מחרוזת אחת למפתח ריבוי, אבל {n} חייב להופיע
    if (names(all) !== names(key.replaceAll('|', ' '))) {
      errors.push(`${idx}: placeholders שונים\n     מקור: ${key}\n     תרגום: ${all}`);
      continue;
    }
    dict[key] = value;
  }
  keys.forEach((k, i) => { if (!seen.has(i)) errors.push(`חסר אינדקס ${i}: ${k.slice(0, 50)}`); });
  if (errors.length) {
    failed++;
    console.log(`${lang}: ${errors.length} שגיאות`);
    errors.slice(0, 15).forEach((e) => console.log('  ' + e));
    continue;
  }
  writeFileSync(`${out}/${lang}.json`, JSON.stringify(dict, null, 1) + '\n');
  console.log(`${lang}: ${Object.keys(dict).length} מפתחות`);
}
process.exit(failed ? 1 : 0);
