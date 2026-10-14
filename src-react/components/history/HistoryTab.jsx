import { useState } from 'react';
import EntriesList from '../entries/EntriesList.jsx';

// ההיסטוריה: הרשומות שלי. להורה יש גם מתג לכל רשומות המשפחה.
export default function HistoryTab({ data, token, me, isParent }) {
  const [all, setAll] = useState(false);
  const list = isParent && all ? data.entries : data.entries.filter((e) => e.from === me || e.to === me);
  return (
    <>
      {isParent && (
        <div className="tools">
          <button className={'ghost' + (!all ? ' active' : '')} type="button" aria-pressed={!all} onClick={() => setAll(false)}>שלי</button>
          <button className={'ghost' + (all ? ' active' : '')} type="button" aria-pressed={all} onClick={() => setAll(true)}>כל המשפחה</button>
        </div>
      )}
      <EntriesList list={list} emptyText="עדיין לא נרשם כלום." token={token} me={me} isParent={isParent}
        lookup={(id) => data.people.find((p) => p.id === id)} debtList={data.entries} />
    </>
  );
}
