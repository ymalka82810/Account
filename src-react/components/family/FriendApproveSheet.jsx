import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../shared/fields.jsx';
import { g } from '../../lib/gender.js';

// הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
export function FriendApproveSheet({ person: p }) {
  const sheet = useSheet();
  const [email, setEmail] = useState(p.friendEmail || '');
  const [err, setErr] = useState('');
  useSheetTitle(t('מצב חברים ל{name}', { name: p.name }));
  return (
    <div className="form">
      <p className="hint">{g(p.gender, '{name} יוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.', '{name} תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.', '{name} יוכל/תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.', { name: p.name })}</p>
      <Field label={t('המייל של {name}', { name: p.name })}>
        <input type="email" dir="ltr" autoComplete="off" placeholder="name@example.com" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <p className="hint">{g(p.gender, 'חברים מוסיפים את הנער לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.', 'חברים מוסיפים את הנערה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.', 'חברים מוסיפים את הנער/ה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.')}</p>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        try {
          await call('friends:approveAccess', { token: state.token, personId: p.id, email });
          sheet.close();
          toast(t('מצב חברים אושר ✅'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('אישור מצב חברים')}</AsyncButton>
    </div>
  );
}
