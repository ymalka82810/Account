import { useEffect } from 'react';
import { t } from '../../i18n/index.js';
import { useQuery, call } from '../../lib/api.js';
import { money, fmtDate } from '../../lib/computations.js';
import { notebookCurrency } from '../../lib/notebook.js';

// הפנקס האישי של ילד/ה שאישר/ה שההורים יראו אותו. לצפייה בלבד: אין כאן שום כפתור שמשנה משהו.
export default function ChildNotebook({ token, person }) {
  const nb = useQuery('notebook:forChild', { token, personId: person.id });
  // נרשם שההורה הזה פתח את הפנקס, כדי שהילד/ה יראה/תראה מי צפה (השרת לא רושם יותר מפעם ב-5 דקות).
  const seen = !!nb;
  useEffect(() => {
    if (seen) call('notebook:markViewed', { token, personId: person.id }).catch(() => {});
  }, [seen, token, person.id]);
  if (nb === undefined) return <p className="hint">{t('⏳ רגע…')}</p>;
  if (!nb) return <p className="hint">{t('{name} עוד לא רשם/ה כלום בפנקס האישי.', { name: person.name })}</p>;
  const cur = nb.currency || notebookCurrency();
  const open = nb.entries.filter((e) => !e.paid);
  const done = nb.entries.filter((e) => e.paid);
  const sum = (d) => open.filter((e) => e.dir === d).reduce((s, e) => s + e.amount, 0);
  const row = (e) => (
    <div className={'row' + (e.paid ? ' paid' : '')} key={e.id}>
      <div className="text">
        <strong>{e.name}</strong>
        <div className="meta">{e.dir === 'iowe' ? t('אני חייב') : t('חייב/ת לי')}{e.note ? ' • ' + e.note : ''} • {fmtDate(e.date)}</div>
      </div>
      <strong>{money(e.amount, cur)}</strong>
    </div>
  );
  return (
    <div>
      <p className="hint">{t('לצפייה בלבד. הפנקס נשאר אצל {name} ואי אפשר לשנות אותו מכאן.', { name: person.name })}</p>
      <p className="meta">{t('אני חייב')}: {money(sum('iowe'), cur)} • {t('חייבים לי')}: {money(sum('owed'), cur)}</p>
      <h2 className="nb-h2">{t('מה פתוח')}</h2>
      {open.length > 0 ? <div className="list">{open.map(row)}</div> : <div className="empty">{t('אין כלום פתוח!')}</div>}
      {done.length > 0 && (
        <details className="nb-paid">
          <summary>{t('שולמו ({n})', { n: done.length })}</summary>
          <div className="list">{done.map(row)}</div>
        </details>
      )}
    </div>
  );
}
