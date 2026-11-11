import { useCallback, useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { client } from '../../lib/client.js';
import { call } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { fmtWhen } from '../../lib/when.js';
import { getMemberships } from '../../lib/memberships.js';
import AsyncButton from '../shared/AsyncButton.jsx';

// "מי רואה את הפנקס שלי": לכל משפחה שהילד/ה אישר/ה בה, מתי העותק עודכן, אילו הורים פתחו אותו,
// ואפשרות להשהות ולחדש את השיתוף בכל רגע. המצב נקרא מכל משפחה בנפרד (לכל אחת טוקן משלה).
function FamilyRow({ m }) {
  const [st, setSt] = useState(undefined);
  const load = useCallback(() => {
    client.query(/** @type {any} */ ('notebook:status'), { token: m.token }).then(setSt).catch(() => setSt(null));
  }, [m.token]);
  useEffect(() => { load(); }, [load]);

  if (!st || !st.shared) return null;

  async function toggle() {
    try {
      await call('notebook:setPaused', { token: m.token, paused: !st.paused });
      // בחידוש המכשיר שולח עותק מיד (App מאזין לאירוע הזה).
      if (st.paused) window.dispatchEvent(new Event('kupa-nb-resync'));
      load();
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="tile-section nb-share-card">
      <strong>{m.familyName}</strong>
      {st.paused ? (
        <p className="hint">{t('השיתוף מושהה. ההורים לא רואים כלום.')}</p>
      ) : (
        <>
          <p className="meta">{st.updatedAt ? t('עודכן לאחרונה: {when}', { when: fmtWhen(st.updatedAt) }) : t('עוד לא נשלח עותק')}</p>
          {st.viewers.length === 0
            ? <p className="meta">{t('עוד אף הורה לא פתח את הפנקס')}</p>
            : (
              <>
                <p className="meta">{t('צפו בפנקס:')}</p>
                {st.viewers.map((v) => <p className="meta" key={v.name}>{v.name}: {fmtWhen(v.at)}</p>)}
              </>
            )}
        </>
      )}
      <AsyncButton className="ghost" onClick={toggle}>{st.paused ? t('▶️ חידוש השיתוף') : t('⏸️ השהיית השיתוף')}</AsyncButton>
    </div>
  );
}

export default function NotebookSharing() {
  const families = getMemberships().filter((m) => m.role === 'child');
  return (
    <div className="form">
      <p className="hint">{t('ההורים של כל משפחה רואים עותק של הפנקס שלך לצפייה בלבד. אפשר להשהות את השיתוף בכל רגע.')}</p>
      {families.map((m) => <FamilyRow key={m.personId} m={m} />)}
    </div>
  );
}
