import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { useSheet } from '../shared/Sheet.jsx';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { money } from '../../lib/computations.js';
import { useNotebook, nameMatch, isMergeDeclined, declineMerge, removeEntries, notebookCurrency } from '../../lib/notebook.js';

// התאמות בין אנשים בפנקס האישי (עם רישומים פתוחים) לבני המשפחה בקופה.
// level: 'same' = אותו שם, 'similar' = שם דומה (צריך לבחור באיזה שם להשתמש).
export function findNotebookMatches(nb, people, me) {
  const out = [];
  for (const p of people) {
    if (p.id === me) continue;
    for (const np of nb.people) {
      const level = nameMatch(np.name, p.name);
      if (!level || isMergeDeclined(np.id + ':' + p.id, nb)) continue;
      const entries = nb.entries.filter((e) => e.personId === np.id && !e.paid);
      if (entries.length) out.push({ np, p, level, entries });
    }
  }
  // התאמות מדויקות קודם
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'same' ? -1 : 1));
}

const useMatches = () => {
  const { data, me } = useApp();
  const nb = useNotebook();
  return findNotebookMatches(nb, data.people, me);
};

// כרטיס בלשונית המשפחה: מופיע רק כשיש התאמות.
export function NotebookMergeCard() {
  const matches = useMatches();
  const sheet = useSheet();
  if (!matches.length) return null;
  const names = [...new Set(matches.map((m) => m.p.name))].join(', ');
  return (
    <div className="card notice">
      <p><strong>{t('יש בפנקס האישי חובות על שמות של בני המשפחה')}</strong> ({names}). {t('רוצים לאחד אותם לקופה המשפחתית?')}</p>
      <button className="primary" type="button" onClick={() => sheet.open(t('איחוד עם הפנקס'), <NotebookMergeSheet />)}>{t('📒 איחוד חובות מהפנקס')}</button>
    </div>
  );
}

// חלון האיחוד: מציג התאמה אחת בכל פעם, עד שלא נשאר מה לשאול.
export function NotebookMergeSheet() {
  const { token, me } = useApp();
  const sheet = useSheet();
  const matches = useMatches();
  const [busy, setBusy] = useState(false);
  const m = matches[0];
  useEffect(() => { if (!m && !busy) sheet.close(); }, [m, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;

  const cur = notebookCurrency();
  const total = m.entries.reduce((s, e) => s + (e.dir === 'iowe' ? -e.amount : e.amount), 0);
  const count = m.entries.length;

  // מעביר את הרישומים הפתוחים לקופה (החוב נרשם מהורה שמחובר), ומסיר מהפנקס רק את מה שהצליח.
  async function merge(renameTo) {
    if (busy) return;
    setBusy(true);
    try {
      if (renameTo && renameTo !== m.p.name) await call('people:rename', { token, id: m.p.id, name: renameTo });
      const moved = [];
      let failed = '';
      for (const e of [...m.entries].reverse()) { // מהישן לחדש
        try {
          const iowe = e.dir === 'iowe';
          await call('entries:add', {
            token, kind: 'debt', from: iowe ? me : m.p.id, to: iowe ? m.p.id : me,
            amount: e.amount, currency: cur, note: (e.note || '').slice(0, 80), date: e.date,
          });
          moved.push(e.id);
        } catch (err) { failed = errMsg(err); }
      }
      removeEntries(moved);
      if (failed) toast(t('{n} רישומים הועברו. את השאר לא הצלחנו להעביר: {err}', { n: moved.length, err: failed }));
      else toast(t('{n} רישומים הועברו לקופה ✅', { n: moved.length }));
    } catch (err) { toast(errMsg(err)); }
    finally { setBusy(false); }
  }

  const summary = t('{n} רישומים פתוחים, ביחד {sum}', { n: count, sum: money(Math.abs(total), cur) });
  const decline = () => declineMerge(m.np.id + ':' + m.p.id);

  return (
    <div className="form">
      {m.level === 'same' ? (
        <>
          <p><strong>{t('בפנקס יש רישומים על “{name}”', { name: m.np.name })}</strong><br />{summary}</p>
          <p>{t('להעביר אותם לקופה המשפחתית אל {name}?', { name: m.p.name })}</p>
          <button className="primary" type="button" disabled={busy} onClick={() => merge()}>{busy ? t('⏳ רגע…') : t('כן, להעביר לקופה')}</button>
          <button className="ghost" type="button" disabled={busy} onClick={decline}>{t('לא, להשאיר בפנקס')}</button>
        </>
      ) : (
        <>
          <p><strong>{t('בפנקס: “{a}”. בקופה: “{b}”.', { a: m.np.name, b: m.p.name })}</strong><br />{summary}</p>
          <p>{t('זה אותו אדם? אם כן, באיזה שם להשתמש?')}</p>
          <button className="primary" type="button" disabled={busy} onClick={() => merge()}>{busy ? t('⏳ רגע…') : t('כן, לאחד תחת “{n}” (השם בקופה)', { n: m.p.name })}</button>
          <button className="primary" type="button" disabled={busy || m.np.name.length > 20} onClick={() => merge(m.np.name)}>{t('כן, לאחד תחת “{n}” (השם בפנקס)', { n: m.np.name })}</button>
          <button className="ghost" type="button" disabled={busy} onClick={decline}>{t('לא, אלה שני אנשים שונים')}</button>
        </>
      )}
    </div>
  );
}
