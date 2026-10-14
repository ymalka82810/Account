import PendingCards from './PendingCards.jsx';
import { pairOwes, openDebtsOf, debtLabel, money } from '../lib/computations.js';

// גרסת React של src/screens/home.js. אותו HTML/classes בדיוק (style.css
// לא משתנה), אבל בלי renderHome() ידני: React מריץ מחדש אוטומטית
// כש-data.entries או data.people משתנים (דרך ה-props שמגיעים מ-useQuery).
//
// openEntryFlow מועבר כ-prop (בינתיים עדיין הפונקציה הישנה מה-vanilla app,
// עד שגם היא תעבור ל-React בשלב נפרד).
//
// שימו לב: אין כאן <section id="tab-home"> - האלמנט הזה נשאר סטטי ב-
// index.html (כדי ש-switchTab() ימשיך למצוא ולהחליף class 'active' עליו),
// ו-React מצייר רק את התוכן הפנימי, לתוך <div id="reactHomeRoot"> שבפנים.
// הכפתורים pushBtn/teenRequestBtn/changePinBtn/emailBtn נשארים סטטיים
// מחוץ ל-React, כי קוד ישן (push.js, app.js, friends.js) ממשיך לשלוט
// בהם ישירות (hidden/textContent/dataset) - אם React היה מצייר אותם
// מחדש בכל רינדור, זה היה דורס את השינויים האלה.
export default function Home({ data, token, openEntryFlow }) {
  const me = data.me.id;
  let owe = 0, get = 0;
  const cards = [];

  for (const p of data.people) {
    if (p.id === me) continue;
    const n = pairOwes(me, p.id, data.entries);
    if (n === 0) continue;
    const iOwe = n > 0;
    const amount = Math.abs(n);
    if (iOwe) owe += amount; else get += amount;
    const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
    const open = openDebtsOf(dFrom, dTo, data.entries);

    cards.push(
      <div key={p.id} className={'debt ' + (iOwe ? 'owe' : 'get') + (open.length > 1 ? ' multi' : '')}>
        <span className="avatar-md" aria-hidden="true">{p.avatar}</span>
        <div className="text">
          <div className="who">{iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי`}</div>
          <div className="amt">{money(amount)}</div>
          {open.length > 1 && (
            <div className="debt-lines">
              {open.map((x) => (
                <div className="debt-line" key={x.debt.id}>
                  <div className="dl-text">
                    <div className="dl-name">{debtLabel(x.debt)}</div>
                    <div className="dl-rem">
                      {x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining)}
                    </div>
                  </div>
                  <button
                    className="small" type="button"
                    onClick={() => openEntryFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })}
                  >
                    {iOwe ? 'שילמתי' : 'קיבלתי'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          className="small strongbtn" type="button"
          onClick={() => openEntryFlow(iOwe
            ? { kind: 'payment', from: me, to: p.id, suggest: amount }
            : { kind: 'payment', from: p.id, to: me, suggest: amount })}
        >
          {iOwe ? '💰 שילמתי' : '💰 קיבלתי'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="summary">
        <div className="sum owe"><div className="lbl">אני חייב/ת</div><div className="num">{money(owe)}</div></div>
        <div className="sum get"><div className="lbl">חייבים לי</div><div className="num">{money(get)}</div></div>
      </div>

      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => openEntryFlow({ kind: 'debt', from: me })}>
          <span aria-hidden="true">💸</span>אני חייב/ת כסף
        </button>
        <button className="bigbtn get" type="button" onClick={() => openEntryFlow({ kind: 'debt', to: me })}>
          <span aria-hidden="true">🤝</span>חייבים לי כסף
        </button>
      </div>

      <div id="pendingBox">
        {data.me.role !== 'parent' && <PendingCards data={data} token={token} parentView={false} />}
      </div>

      <h2>מי חייב למי</h2>
      <div id="myDebts">
        {data.people.length < 2 ? (
          <div className="empty">עוד אין אף אחד אחר במשפחה. הורה צריך להוסיף אותם.</div>
        ) : cards.length === 0 ? (
          <div className="empty"><div className="big-emoji" aria-hidden="true">🎉</div>אף אחד לא חייב כלום!</div>
        ) : cards}
      </div>
    </>
  );
}
