import Arrow from '../shared/Arrow.jsx';
import { t } from '../../i18n/index.js';
import { useQuery } from '../../lib/api.js';
import { money, roleLabel } from '../../lib/computations.js';
import { fmtWhen } from '../../lib/when.js';

// פעולה → תווית קצרה. הכול עובדות שנשמרו ברגע הפעולה (שמות כפי שהיו אז), בלי הערות חופשיות.
const actions = () => ({
  debt_add: t('רשם/ה חוב'), payment_add: t('רשם/ה החזר'), entry_pending: t('ביקש/ה אישור'),
  entry_approved: t('אישר/ה'), entry_rejected: t('דחה/תה'), entry_removed: t('מחק/ה'),
  person_add: t('הוסיף/ה בן/בת משפחה'), person_remove: t('הסיר/ה בן/בת משפחה'), role_set: t('שינה/תה תפקיד'),
  person_rename: t('שינה/תה שם'), join_approved: t('אישר/ה הצטרפות'), join_rejected: t('דחה/תה הצטרפות'),
  family_rename: t('שינה/תה את שם המשפחה'), code_rotated: t('החליף/ה את קוד המשפחה'),
  locale_set: t('שינה/תה מדינה ומטבע'), device_revoked: t('הסיר/ה מכשיר'),
});

function detail(r) {
  if (r.amount != null && r.from && r.to) return <>{r.from} <Arrow kind="next" /> {r.to}, {money(r.amount, r.currency || undefined)}</>;
  if (r.kind === 'role_set') return <>{r.subject} <Arrow kind="next" /> {roleLabel(r.to)}</>;
  if (r.kind === 'person_rename') return <>{r.from} <Arrow kind="next" /> {r.subject}</>;
  return r.subject || '';
}

// יומן שינויים (הורים): מי שינה מה ומתי.
export default function ActivityLog({ token }) {
  const rows = useQuery('activity:list', { token });
  if (rows === undefined) return <p className="hint">{t('⏳ רגע…')}</p>;
  if (rows.length === 0) return <div className="empty">{t('עוד אין שינויים ביומן.')}</div>;
  const label = actions();
  return (
    <div className="list">
      {rows.map((r) => (
        <div className="row" key={r.id}>
          <div className="text">
            <strong>{r.actor} {label[r.kind] || r.kind}</strong>
            {detail(r) && <div className="meta">{detail(r)}</div>}
          </div>
          <span className="meta">{fmtWhen(r.at)}</span>
        </div>
      ))}
    </div>
  );
}
