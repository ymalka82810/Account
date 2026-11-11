import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { state } from '../../state/state.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { codeGone, route, setToken } from '../../state/auth.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import AsyncButton from '../shared/AsyncButton.jsx';
import { pinProps, Err, Field, PasswordInput } from '../shared/fields.jsx';
import { pinLabel, pinMax, pinOk } from '../../lib/pin.js';
import { proveWithGoogle } from '../../lib/googleProof.js';

// שכחתי קוד (במסך הכניסה, לכל תפקיד): בוחרים קוד חדש ומאשרים עם חשבון הגוגל המחובר.
// בלי חשבון גוגל מחובר: הורה קובע קוד חדש (ולהורה - הורה אחר).
export function ForgotPinSheet() {
  const sheet = useSheet();
  const f = state.pinFlow;
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');
  useSheetTitle(t('שכחתי את הקוד'));
  if (!f || f.legacy) return null;
  const role = f.person.role;

  return (
    <div className="form">
      <p className="hint">{t('אם חיברתם חשבון גוגל, בחרו קוד חדש ואשרו עם גוגל. אם לא, הורה יכול לקבוע לכם קוד חדש.')}</p>
      <Field label={t('קוד חדש ({rule})', { rule: pinLabel(role) })}><PasswordInput {...pinProps('new-password', pinMax(role))} value={newPin} onChange={(e) => setNewPin(e.target.value)} /></Field>
      {err && <Err>{err}</Err>}
      <AsyncButton className="primary" onClick={async () => {
        setErr('');
        if (!pinOk(newPin, role)) { setErr(t('הקוד החדש צריך להיות {rule}.', { rule: pinLabel(role) })); return; }
        const r = await proveWithGoogle('pinReset', { code: state.fam.code, personId: f.person.id });
        if (!r) return;
        if (r.reason === 'code') { sheet.close(); codeGone(); return; }
        if (r.error) { setErr(r.reason === 'noGoogle' ? t('לא חובר חשבון גוגל, ולכן אי אפשר לאפס כך. בקשו מהורה לקבוע לכם קוד חדש.') : r.error); return; }
        try {
          const res = await call('googleLink:resetWithProof', { code: state.fam.code, personId: f.person.id, proof: r.proof, newPin });
          if (res.ok) {
            sheet.close();
            // הורה שקשור למכשיר נכנס רק מהמכשיר שלו, ולכן אחרי האיפוס חוזרים למסך הקוד להיכנס עם הקוד החדש.
            if (!res.token) { toast(t('הקוד עודכן. היכנסו עם הקוד החדש מהמכשיר שלכם.')); state.pinFlow = null; route(); return; }
            state.pinFlow = null; setToken(res.token); return;
          }
          if (res.reason === 'code') { sheet.close(); codeGone(); return; }
          setErr(res.reason === 'throttled' ? t('יותר מדי ניסיונות. נסו שוב עוד כמה דקות.') : t('משהו השתבש. נסו שוב.'));
        } catch (e) { setErr(errMsg(e)); }
      }}>{t('אישור עם גוגל והכניסה')}</AsyncButton>
    </div>
  );
}
