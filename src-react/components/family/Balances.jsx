import Avatar from '../shared/Avatar.jsx';
import { money } from '../../lib/computations.js';
import Arrow from '../shared/Arrow.jsx';
import { useSheet } from '../shared/Sheet.jsx';
import PersonSheet from './PersonSheet.jsx';
import { balanceOf, balanceWhat } from './balance.js';

// בני המשפחה: שורה קטנה לכל אדם (שם ויתרה). לחיצה פותחת את הדף האישי שלו בחלון תחתון.
export default function Balances({ people, debts }) {
  const sheet = useSheet();
  return (
    <div className="fam-rows">
      {people.map((p) => {
        const v = balanceOf(p.id, debts);
        return (
          <button type="button" key={p.id} className={'fam-row ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero')}
            onClick={() => sheet.open('', <PersonSheet personId={p.id} />)}>
            {p.avatar && <Avatar value={p.avatar} className="fam-av" />}
            <span className="fam-name">{p.name}</span>
            <span className="fam-amt"><strong>{money(Math.abs(v))}</strong><small>{balanceWhat(p, v)}</small></span>
            <Arrow kind="chev-next" />
          </button>
        );
      })}
    </div>
  );
}
