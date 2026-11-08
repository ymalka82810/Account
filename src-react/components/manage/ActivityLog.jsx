import Arrow from '../shared/Arrow.jsx';
import { t } from '../../i18n/index.js';
import { g } from '../../lib/gender.js';
import { useQuery } from '../../lib/api.js';
import { money, roleLabel } from '../../lib/computations.js';
import { fmtWhen } from '../../lib/when.js';

// פעולה → תווית קצרה בצורת הפנייה של מי שביצע/ה (actorGender). בלי מגדר חוזרים לצורה הכפולה.
// בהוספה/הסרה של בן/בת משפחה השם עצמו (בן/בת) הולך לפי מי שהפעולה נעשתה עליו/ה (subjectGender).
// הכול עובדות שנשמרו ברגע הפעולה (שמות ומגדר כפי שהיו אז), בלי הערות חופשיות.
// כל צורה כתובה כמחרוזת מפורשת בקריאה ל-g, כדי שחילוץ התרגומים (i18n-extract) ימצא אותה.
function actionLabel(r) {
  const a = r.actorGender;
  const sg = r.subjectGender;
  switch (r.kind) {
    case 'debt_add': return g(a, 'רשם חוב', 'רשמה חוב', 'רשם/ה חוב');
    case 'payment_add': return g(a, 'רשם החזר', 'רשמה החזר', 'רשם/ה החזר');
    case 'entry_pending': return g(a, 'ביקש אישור', 'ביקשה אישור', 'ביקש/ה אישור');
    case 'entry_approved': return g(a, 'אישר', 'אישרה', 'אישר/ה');
    case 'entry_rejected': return g(a, 'דחה', 'דחתה', 'דחה/תה');
    case 'entry_removed': return g(a, 'מחק', 'מחקה', 'מחק/ה');
    case 'role_set': return g(a, 'שינה תפקיד', 'שינתה תפקיד', 'שינה/תה תפקיד');
    case 'person_rename': return g(a, 'שינה שם', 'שינתה שם', 'שינה/תה שם');
    case 'join_approved': return g(a, 'אישר הצטרפות', 'אישרה הצטרפות', 'אישר/ה הצטרפות');
    case 'join_rejected': return g(a, 'דחה הצטרפות', 'דחתה הצטרפות', 'דחה/תה הצטרפות');
    case 'family_rename': return g(a, 'שינה את שם המשפחה', 'שינתה את שם המשפחה', 'שינה/תה את שם המשפחה');
    case 'code_rotated': return g(a, 'החליף את קוד המשפחה', 'החליפה את קוד המשפחה', 'החליף/ה את קוד המשפחה');
    case 'locale_set': return g(a, 'שינה מדינה ומטבע', 'שינתה מדינה ומטבע', 'שינה/תה מדינה ומטבע');
    case 'device_revoked': return g(a, 'הסיר מכשיר', 'הסירה מכשיר', 'הסיר/ה מכשיר');
    case 'goal_add': return g(a, 'פתח יעד חיסכון', 'פתחה יעד חיסכון', 'פתח/ה יעד חיסכון');
    case 'goal_deposit': return g(a, 'הפקיד ליעד חיסכון', 'הפקידה ליעד חיסכון', 'הפקיד/ה ליעד חיסכון');
    case 'goal_deposit_pending': return g(a, 'ביקש להפקיד ליעד חיסכון', 'ביקשה להפקיד ליעד חיסכון', 'ביקש/ה להפקיד ליעד חיסכון');
    case 'goal_deposit_approved': return g(a, 'אישר הפקדה ליעד חיסכון', 'אישרה הפקדה ליעד חיסכון', 'אישר/ה הפקדה ליעד חיסכון');
    case 'goal_deposit_rejected': return g(a, 'דחה הפקדה ליעד חיסכון', 'דחתה הפקדה ליעד חיסכון', 'דחה/תה הפקדה ליעד חיסכון');
    case 'goal_removed': return g(a, 'מחק יעד חיסכון', 'מחקה יעד חיסכון', 'מחק/ה יעד חיסכון');
    case 'person_add':
      return sg === 'male' ? g(a, 'הוסיף בן משפחה', 'הוסיפה בן משפחה', 'הוסיף/ה בן משפחה')
        : sg === 'female' ? g(a, 'הוסיף בת משפחה', 'הוסיפה בת משפחה', 'הוסיף/ה בת משפחה')
        : g(a, 'הוסיף בן/בת משפחה', 'הוסיפה בן/בת משפחה', 'הוסיף/ה בן/בת משפחה');
    case 'person_remove':
      return sg === 'male' ? g(a, 'הסיר בן משפחה', 'הסירה בן משפחה', 'הסיר/ה בן משפחה')
        : sg === 'female' ? g(a, 'הסיר בת משפחה', 'הסירה בת משפחה', 'הסיר/ה בת משפחה')
        : g(a, 'הסיר בן/בת משפחה', 'הסירה בן/בת משפחה', 'הסיר/ה בן/בת משפחה');
    default: return r.kind;
  }
}

function detail(r) {
  if (r.amount != null && r.from && r.to) return <>{r.from} <Arrow kind="next" /> {r.to}, {money(r.amount, r.currency || undefined)}</>;
  if (r.kind.startsWith('goal_') && r.amount != null) return <>{r.to ? `${r.to}: ` : ''}{r.subject}, {money(r.amount, r.currency || undefined)}</>;
  if (r.kind === 'role_set') return <>{r.subject} <Arrow kind="next" /> {roleLabel(r.to, r.subjectGender)}</>;
  if (r.kind === 'person_rename') return <>{r.from} <Arrow kind="next" /> {r.subject}</>;
  return r.subject || '';
}

// יומן שינויים (הורים): מי שינה מה ומתי.
export default function ActivityLog({ token }) {
  const rows = useQuery('activity:list', { token });
  if (rows === undefined) return <p className="hint">{t('⏳ רגע…')}</p>;
  if (rows.length === 0) return <div className="empty empty-sm">{t('עוד אין שינויים ביומן.')}</div>;
  return (
    <div className="list">
      {rows.map((r) => (
        <div className="row" key={r.id}>
          <div className="text">
            <strong>{r.actor} {actionLabel(r)}</strong>
            {detail(r) && <div className="meta">{detail(r)}</div>}
          </div>
          <span className="meta">{fmtWhen(r.at)}</span>
        </div>
      ))}
    </div>
  );
}
