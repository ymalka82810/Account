// חד-פעמי: ממזג את התרגומים החדשים (new/<שפה>.json, לפי סדר המפתחות החדשים) לקובצי translations/*.txt
// לפי keys.json הנוכחי. מפתחות ישנים שנמחקו נזרקים.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const newKeys = JSON.parse(readFileSync('scripts/i18n/keys.json', 'utf8'));
const oldKeys = JSON.parse(execSync('git show HEAD:scripts/i18n/keys.json', { encoding: 'utf8' }));
const oldSet = new Set(oldKeys);
const added = newKeys.filter((k) => !oldSet.has(k));
let bad = 0;

for (const f of readdirSync('scripts/i18n/translations').filter((x) => x.endsWith('.txt'))) {
  const lang = f.slice(0, -4);
  const np = `scripts/i18n/new/${lang}.json`;
  if (!existsSync(np)) { console.log('skip', lang); continue; }
  const add = JSON.parse(readFileSync(np, 'utf8'));
  if (add.length !== added.length) { console.log(lang, 'wrong length', add.length); bad++; continue; }
  const byKey = new Map();
  for (const l of readFileSync(`scripts/i18n/translations/${f}`, 'utf8').split(/\r?\n/).filter((x) => x.trim())) {
    const b = l.indexOf('|');
    byKey.set(oldKeys[Number(l.slice(0, b))], l.slice(b + 1));
  }
  added.forEach((k, i) => {
    let v = add[i];
    if (k.includes('|')) {
      if (typeof v === 'string' && v.includes('|')) { const [one, other] = v.split('|'); v = { one, other }; }
      v = typeof v === 'string' ? v : JSON.stringify(v);
    }
    byKey.set(k, v.replace(/\n/g, '\\n'));
  });
  const out = newKeys.map((k, i) => {
    if (!byKey.has(k)) throw new Error(`${lang}: missing ${k}`);
    return `${i}|${byKey.get(k)}`;
  });
  writeFileSync(`scripts/i18n/translations/${f}`, out.join('\n') + '\n');
  console.log('merged', lang);
}
process.exit(bad ? 1 : 0);
