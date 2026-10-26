import { useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import EntriesList from '../entries/EntriesList.jsx';

const PAGE_SIZE = 30;

// ההיסטוריה: הרשומות שלי. להורה יש גם מתג לכל רשומות המשפחה.
// נטענת בדפים מהשרת ("עוד"), כך שהיא לא גדלה עם השנים. data.entries הן רק הרשומות הפעילות.
export default function HistoryTab({ data, token, me, isParent }) {
  const [all, setAll] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    /** @type {any} */ ('history:page'), token ? { token, all: isParent && all } : 'skip', { initialNumItems: PAGE_SIZE },
  );
  return (
    <>
      {isParent && (
        <div className="tools">
          <button className={'ghost' + (!all ? ' active' : '')} type="button" aria-pressed={!all} onClick={() => setAll(false)}>שלי</button>
          <button className={'ghost' + (all ? ' active' : '')} type="button" aria-pressed={all} onClick={() => setAll(true)}>כל המשפחה</button>
        </div>
      )}
      {status === 'LoadingFirstPage'
        ? <div className="empty">טוען…</div>
        : <EntriesList list={results} emptyText="עדיין לא נרשם כלום." token={token} me={me} isParent={isParent}
            lookup={(id) => data.people.find((p) => p.id === id)} debtList={data.entries} />}
      {status === 'CanLoadMore' && (
        <button className="ghost" type="button" onClick={() => loadMore(PAGE_SIZE)}>עוד</button>
      )}
    </>
  );
}
