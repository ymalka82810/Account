import { useState } from 'react';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../appContext.js';
import { useSheet, useSheetTitle } from '../Sheet.jsx';
import AsyncButton from '../AsyncButton.jsx';
import { codeProps, pinProps, Err, Field } from '../sheets/fields.jsx';

// הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
export function FriendApproveSheet({ person: p }) {
  const sheet = useSheet();
  const [email, setEmail] = useState(p.friendEmail || '');
  const [err, setErr] = useState('');
  useSheetTitle('מצב חברים ל' + p.name);
  return (
    <div className="form">
      <p className="hint">{p.name} יוכל/תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.</p>
      <Field label={`המייל של ${p.name}`}>
        <input type="email" dir="ltr" autoComplete="off" placeholder="name@example.com" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <p className="hint">חברים מוסיפים את הנער/ה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.</p>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        try {
          await call('friends:approveAccess', { token: state.token, personId: p.id, email });
          sheet.close();
          toast('מצב חברים אושר ✅');
        } catch (e) { setErr(errMsg(e)); }
      }}>אישור מצב חברים</AsyncButton>
    </div>
  );
}
