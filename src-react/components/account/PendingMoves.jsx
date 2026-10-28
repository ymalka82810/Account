import { t } from '../../i18n/index.js';
import { intlLocale } from '../../i18n/index.js';
import { call, useQuery } from '../../lib/api.js';
import { toast, errMsg } from '../../lib/helpers.js';
import { useApp } from '../../state/appContext.js';

// התראה להורים: מישהו ביקש להחליף מכשיר להורה (טלפון שאבד). ההחלפה מבשילה אחרי 24 שעות, ועד אז כל הורה יכול לבטל.
export default function PendingMoves() {
  const { token } = useApp();
  const pend = useQuery('deviceMove:pendingMoves', { token });
  if (!pend || !pend.length) return null;
  const when = (ms) => new Date(ms).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="demo-banner" role="alert">
      {pend.map((p) => (
        <span key={p.personId}>
          {p.mine
            ? t('⚠️ הוגשה בקשה להחליף את המכשיר שלכם. ההחלפה תתאפשר ב-{when}. אם זה לא אתם, בטלו אותה.', { when: when(p.readyAt) })
            : t('⚠️ הוגשה בקשה להחליף את המכשיר של {name} (תתאפשר ב-{when}). אם זה לא ידוע לכם, בטלו אותה.', { name: p.name, when: when(p.readyAt) })}
          {' '}
          <button type="button" className="danger" onClick={async () => {
            try { await call('deviceMove:cancelRecovery', { token, personId: p.personId }); toast(t('הבקשה בוטלה')); }
            catch (e) { toast(errMsg(e)); }
          }}>{t('ביטול הבקשה')}</button>
        </span>
      ))}
    </div>
  );
}
