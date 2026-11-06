import { t } from '../../i18n/index.js';

// "משפחת" (או המקבילה בשפה הנבחרת) קבוע בשדה; המשתמש מקליד רק את שם המשפחה עצמו.
// התבנית היא מחרוזת תרגום אחת, 'משפחת {name}', ומפצלים אותה לקידומת ולסיומת.
const MARK = '\uE000';
export const famAffixes = () => t('משפחת {name}', { name: MARK }).split(MARK);

// השם המלא לשמירה. אם המשתמש הקליד בעצמו גם את המילה הקבועה, לא מכפילים אותה.
export function buildFamilyName(raw) {
  const [pre, post] = famAffixes();
  let v = raw.trim();
  const p = pre.trim(), s = post.trim();
  if (p && v.startsWith(p + ' ')) v = v.slice(p.length).trim();
  if (s && v.endsWith(' ' + s)) v = v.slice(0, -s.length).trim();
  return pre + v + post;
}

// החלק שמוצג בשדה מתוך שם מלא קיים (בלי הקידומת והסיומת).
export function bareFamilyName(full) {
  const [pre, post] = famAffixes();
  let v = full || '';
  if (pre && v.startsWith(pre)) v = v.slice(pre.length);
  if (post && v.endsWith(post)) v = v.slice(0, -post.length);
  return v;
}

export default function FamilyNameField({ value, onChange, autoFocus, required = true, invalid }) {
  const [pre, post] = famAffixes();
  return (
    <span className="affix-row">
      {pre && <span className="affix" aria-hidden="true">{pre}</span>}
      <input type="text" maxLength={30 - pre.length - post.length} placeholder={t('כהן')} required={required} autoFocus={autoFocus} aria-invalid={invalid || undefined} className={invalid ? 'invalid' : undefined}
        value={value} onChange={(e) => onChange(e.target.value)} />
      {post && <span className="affix" aria-hidden="true">{post}</span>}
    </span>
  );
}
