import { useState } from 'react';
import { t, tn } from '../../i18n/index.js';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import { toast, errMsg } from '../../lib/helpers.js';
import { BioError } from '../../lib/biometric.js';
import { useSheet } from '../shared/Sheet.jsx';
import { ResetPinSheet } from './ResetPinSheet.jsx';
import { BindCodeSheet } from './BindCodeSheet.jsx';
import { useRun } from '../../lib/useRun.js';
import { call } from '../../lib/api.js';
import { roleLabel } from '../../lib/computations.js';
import Select from '../shared/Select.jsx';
import { g, GENDER_OPTIONS } from '../../lib/gender.js';

// כאן זו קביעה ראשונית וחד-פעמית (לא ניתנת לשינוי אחר כך), אז בלי אפשרות "ללא ציון".
const GENDER_SET_OPTIONS = GENDER_OPTIONS.filter((o) => o.value);
const genderPlaceholder = () => [{ value: '', label: t('קביעת צורת פנייה…') }, ...GENDER_SET_OPTIONS];

// בני המשפחה: קוד חדש, תפקיד (ילד/נער/הורה, באישור ביומטרי), כיבוי מצב חברים והסרה.
export default function PeopleList({ people, me, token, joinRequests = [] }) {
  const sheet = useSheet();
  const run = useRun(token);
  const confirm = useConfirm();
  const [roleBusy, setRoleBusy] = useState(null);
  const bioConfirm = useBioConfirm();

  // שינוי תפקיד (ילד/ה, נער/ה, הורה) דורש אישור בטביעת אצבע או זיהוי פנים.
  async function changeRole(p, toRole) {
    if (!toRole || toRole === p.role || roleBusy) return;
    if (p.role === 'teen' && p.friendsEnabled && !(await confirm({
      icon: '🤝',
      title: t('ביטול מצב חברים'),
      amount: p.name,
      message: g(p.gender, 'הוא יאבד את מצב החברים. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'היא תאבד את מצב החברים. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'הנער/ה יאבד/תאבד את מצב החברים. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.'),
      okText: t('כן, להמשיך'),
      danger: true,
    }))) return;
    if (toRole === 'parent' && !(await confirm({
      icon: '🔐',
      title: t('הענקת הרשאות הורה'),
      amount: p.name,
      message: g(p.gender, 'הוא יקבל הרשאות הורה מלאות: לראות הכול, לאשר, למחוק ולנהל את המשפחה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'היא תקבל הרשאות הורה מלאות: לראות הכול, לאשר, למחוק ולנהל את המשפחה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'יקבל/תקבל הרשאות הורה מלאות: לראות הכול, לאשר, למחוק ולנהל את המשפחה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.'),
      okText: t('כן, להמשיך'),
    }))) return;
    if (p.role === 'parent' && !(await confirm({
      icon: '⚠️',
      title: t('ביטול הרשאות הורה'),
      amount: p.name,
      message: g(p.gender, 'הוא יאבד את הרשאות ההורה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'היא תאבד את הרשאות ההורה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.', 'יאבד/תאבד את הרשאות ההורה. אחר כך תידרש אימות בזיהוי פנים או טביעת אצבע.'),
      okText: t('כן, להמשיך'),
      danger: true,
    }))) return;
    setRoleBusy(p.id);
    try {
      const proof = await bioConfirm(`role:${p.id}:${toRole}`, { why: t('כדי שילד לא יהפוך את עצמו להורה, שינוי תפקיד מאושר על ידי הורה. תיפתח עכשיו בקשת אימות מהמכשיר.') });
      await call('people:setRole', { token, id: p.id, role: toRole, proof });
      toast(t('{name} עכשיו {role} ✅', { name: p.name, role: roleLabel(toRole, p.gender) }));
    } catch (e) {
      toast(e instanceof BioError ? e.message : errMsg(e));
    } finally { setRoleBusy(null); }
  }

  // קוד קישור להורה אחר: לקישור מכשיר חדש, או כשהטלפון שלו נהרס. דורש טביעת אצבע, וקשור להורה הזה.
  async function bindCode(p) {
    try {
      const proof = await bioConfirm(`bind:${p.id}`, { title: t('קוד קישור ל{name}', { name: p.name }), need: t('להנפיק קוד קישור') });
      const res = await call('deviceMove:issueBindCode', { token, personId: p.id, proof });
      sheet.open(t('קוד קישור ל{name}', { name: res.name }), <BindCodeSheet code={res.code} name={res.name} />);
    } catch (e) {
      toast(e instanceof BioError ? e.message : errMsg(e));
    }
  }

  function changeGender(p, gender) {
    run('people:setGender', { id: p.id, gender });
  }

  return (
    <div id="peopleList">
      {joinRequests.map((r) => (
        <div className="person" key={r.id}>
          {r.avatar && <span className="avatar-md" aria-hidden="true">{r.avatar}</span>}
          <div className="text">
            {r.name} <span className="meta">{t('⏳ מבקש/ת להצטרף')}</span>
          </div>
          <button className="small" type="button" onClick={() => run('auth:approveJoin', { requestId: r.id }, t('{name} אושר/ה ✅', { name: r.name }))}>{t('אישור')}</button>
          <button className="small danger" type="button" onClick={() => run('auth:rejectJoin', { requestId: r.id }, t('הבקשה נדחתה'))}>{t('דחייה')}</button>
        </div>
      ))}
      {people.map((p) => (
        <div className="person" key={p.id}>
          {p.avatar && <span className="avatar-md" aria-hidden="true">{p.avatar}</span>}
          <div className="text">
            {p.name}{' '}
            <span className="meta">
              {roleLabel(p.role, p.gender) + (p.hasPin ? '' : ' • ' + g(p.gender, 'עוד לא בחר קוד', 'עוד לא בחרה קוד', 'עוד לא בחר/ה קוד')) + (p.role === 'parent' && !p.deviceBound ? ' • ' + t('⏳ עוד לא קשור/ה למכשיר') : '')}
            </span>
            {p.lockAlert && (
              <div className="meta" style={{ color: '#b45309' }}>
                {tn(p.lockAlert.count, '⚠️ הקוד של {name} ננעל פעם אחת אחרי ניסיונות שגויים.', '⚠️ הקוד של {name} ננעל {n} פעמים אחרי ניסיונות שגויים.', { name: p.name })}
                {' '}{g(p.gender, 'אם זה לא הוא, כדאי לקבוע קוד חדש.', 'אם זה לא היא, כדאי לקבוע קוד חדש.', 'אם זה לא הוא/היא, כדאי לקבוע קוד חדש.')}
                {' '}<button className="small" type="button" onClick={() => run('auth:unlockPerson', { personId: p.id }, t('הנעילה שוחררה ✅'))}>{t('שחרור נעילה')}</button>
              </div>
            )}
            {p.role === 'teen' && p.friendsEnabled && <div className="meta">{t('🤝 מצב חברים פעיל')} • {p.friendEmail || ''}</div>}
            {p.id !== me && (
              <div className="meta">
                {t('תפקיד:')}{' '}
                {roleBusy === p.id ? <span>{t('⏳ מאמתים…')}</span> : (
                  <Select className="dd-inline" value={p.role} onChange={(r) => changeRole(p, r)} options={[
                    { value: 'child', label: g(p.gender, 'ילד', 'ילדה', 'ילד/ה') },
                    { value: 'teen', label: g(p.gender, 'נער', 'נערה', 'נער/ה') },
                    { value: 'parent', label: t('הורה') },
                  ]} />
                )}
                {' '}<span aria-hidden="true">🔒</span>
              </div>
            )}
            <div className="meta">
              {t('צורת פנייה:')}{' '}
              {p.gender ? (
                <span>{g(p.gender, 'זכר', 'נקבה')}</span>
              ) : (
                <Select className="dd-inline" value="" onChange={(gender) => gender && changeGender(p, gender)} options={genderPlaceholder()} />
              )}
            </div>
          </div>
          <button className="small" type="button" onClick={() => sheet.open(t('קוד סודי ל{name}', { name: p.name }), <ResetPinSheet person={p} />)}>{t('קוד חדש')}</button>
          {p.role === 'parent' && p.id !== me && (
            <button className="small" type="button" onClick={() => bindCode(p)}>{t('קוד קישור למכשיר')}</button>
          )}
          {p.role === 'teen' && p.friendsEnabled && (
            <button className="small danger" type="button" onClick={() => {
              if (!confirm(t('לכבות את מצב החברים של {name}? אי אפשר יהיה להוסיף רישומים חדשים עם חברים.', { name: p.name }))) return;
              run('friends:disableAccess', { personId: p.id }, t('מצב חברים כובה'));
            }}>{t('כיבוי חברים')}</button>
          )}
          {p.id !== me && (
            <button className="small danger" type="button" aria-label={t('הסרת {name}', { name: p.name })} onClick={() => {
              if (!confirm(t('להסיר את {name} מהמשפחה?', { name: p.name }))) return;
              run('people:remove', { id: p.id }, g(p.gender, '{name} הוסר', '{name} הוסרה', '{name} הוסר/ה', { name: p.name }));
            }}>{t('הסרה')}</button>
          )}
        </div>
      ))}
    </div>
  );
}
