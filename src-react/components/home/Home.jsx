import Avatar from '../shared/Avatar.jsx';
import { useState } from 'react';
import Arrow from '../shared/Arrow.jsx';
import UiIcon from '../shared/UiIcon.jsx';
import { t } from '../../i18n/index.js';
import { useApp } from '../../state/appContext.js';
import { GoldBarArt, SumNum } from '../shared/GoldBar.jsx';
import { useSheet } from '../shared/Sheet.jsx';
import Goals from '../goals/Goals.jsx';
import Achievements from '../goals/Achievements.jsx';
import BalanceSheet from './BalanceSheet.jsx';
import PendingCards from '../entries/PendingCards.jsx';
import DebtLines from '../entries/DebtLines.jsx';
import WhatsAppRemind from '../entries/WhatsAppRemind.jsx';
import { pairOwes, openDebtsOf, money, namesFor, baseCurrency } from '../../lib/computations.js';
import { g } from '../../lib/gender.js';

// מסך הבית: סיכום, כפתורי רישום, אישורים ממתינים והחובות הפתוחים.
// ההגדרות האישיות נמצאות ב"החשבון שלי" (AccountSheet), בכותרת.
export default function Home({ data, token }) {
  const { openEntryFlow } = useApp();
  const sheet = useSheet();
  const me = data.me.id;
  // הסבר קצר שמוצג פעם אחת לילד/ה בכניסה הראשונה, ונזכר לפי אדם (לא לפי מכשיר בלבד).
  const introKey = 'introSeen:' + me;
  const [showIntro, setShowIntro] = useState(() => {
    if (data.me.role === 'parent') return false;
    try { return !localStorage.getItem(introKey); } catch (e) { return false; }
  });
  const closeIntro = () => {
    setShowIntro(false);
    try { localStorage.setItem(introKey, '1'); } catch (e) { /* */ }
  };
  const { owesLine } = namesFor(me, (id) => data.people.find((p) => p.id === id));
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
      <div key={p.id} className={'debt ' + (iOwe ? 'owe' : 'get')}>
        {p.avatar && <Avatar as="div" value={p.avatar} className="debt-avatar avatar-md" />}
        <button type="button" className="debt-total" aria-label={t('פירוט החישוב')}
          onClick={() => sheet.open('', <BalanceSheet otherId={p.id} />)}>
          <span className="who">{iOwe ? owesLine(me, p.id) : owesLine(p.id, me)}</span>
          <span className="amt">{money(amount)}</span>
          <span className="debt-more">{t('לחצו לפירוט החישוב')} <Arrow kind="chev-next" /></span>
        </button>
        <DebtLines open={open} iOwe={iOwe} onPay={(x) => openEntryFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })} />
        {open.length === 0 && (
          <button className="small charcoalbtn" type="button"
            onClick={() => openEntryFlow(iOwe
              ? { kind: 'payment', from: me, to: p.id, suggest: amount }
              : { kind: 'payment', from: p.id, to: me, suggest: amount })}>
            {iOwe ? t('שילמתי') : t('קיבלתי')}
          </button>
        )}
        {!iOwe && data.me.role !== 'child' && <WhatsAppRemind name={p.name} open={open} total={money(amount)} display={baseCurrency()} />}
      </div>
    );
  }

  return (
    <>
      {showIntro && (
        <div className="card notice intro">
          <h3>{t('ברוכים הבאים לקופה 🪙')}</h3>
          <p>{t('כאן רושמים מי חייב למי. לוחצים על אחד הכפתורים הגדולים, בוחרים אדם וסכום, וזהו.')}</p>
          <p>{t('כל רישום שלכם מחכה לאישור של הורה, ורק אחרי זה הוא נכנס לחשבון. אם טעיתם, אפשר לבטל תוך 10 דקות.')}</p>
          <button className="small okbtn" type="button" onClick={closeIntro}>{t('הבנתי')}</button>
        </div>
      )}

      <div className="summary">
        <div className="sum owe"><GoldBarArt /><div className="lbl">{g(data.me.gender, 'אני חייב', 'אני חייבת', 'אני חייב/ת')}</div><SumNum amount={owe} /></div>
        <div className="sum get"><GoldBarArt /><div className="lbl">{t('חייבים לי')}</div><SumNum amount={get} /></div>
      </div>

      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => openEntryFlow({ kind: 'debt', from: me })}>
          <UiIcon name="fly-money" />{g(data.me.gender, 'אני חייב כסף', 'אני חייבת כסף', 'אני חייב/ת כסף')}
        </button>
        <button className="bigbtn get" type="button" onClick={() => openEntryFlow({ kind: 'debt', to: me })}>
          <UiIcon name="handshake" />{t('חייבים לי כסף')}
        </button>
      </div>

      <div id="pendingBox">
        {data.me.role !== 'parent' && <PendingCards data={data} token={token} parentView={false} />}
      </div>

      <h2>{t('מי חייב למי')}</h2>
      <div id="myDebts">
        {data.people.length < 2 ? (
          <div className="empty empty-sm">{t('עוד אין אף אחד אחר במשפחה. הורה צריך להוסיף אותם.')}</div>
        ) : cards.length === 0 ? (
          <div className="empty"><div className="big-emoji" aria-hidden="true">🎉</div>{t('אף אחד לא חייב כלום!')}</div>
        ) : cards}
      </div>

      {data.me.role !== 'parent' && <Goals data={data} token={token} />}
      {data.me.role !== 'parent' && <Achievements title={t('הישגים')} personId={me} entries={data.entries} goals={data.goals} />}
    </>
  );
}
