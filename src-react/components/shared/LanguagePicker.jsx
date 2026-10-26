import { useState } from 'react';
import Select from './Select.jsx';
import { LANGUAGES, LANG_CODES, setLang, isInstalled } from '../../i18n/index.js';
import { useLang } from '../../i18n/useLang.js';
import { toast } from '../../lib/helpers.js';
import { t } from '../../i18n/index.js';

// בחירת שפת הממשק. אנגלית מובנית; שפה אחרת מורדת בבחירה ונשמרת במכשיר (⬇ = עוד לא הורדה).
// השם של כל שפה מוצג בשפתה, כדי שאפשר יהיה למצוא אותה גם כשהממשק בשפה זרה.
export default function LanguagePicker() {
  const lang = useLang();
  const [busy, setBusy] = useState(false);

  async function pick(code) {
    if (busy || code === lang) return;
    setBusy(true);
    const ok = await setLang(code);
    setBusy(false);
    if (!ok) toast(t('ההורדה נכשלה. בדקו חיבור לאינטרנט ונסו שוב'));
  }

  return (
    <div className="field"><span>{t('שפה')}</span>
      <Select value={lang} onChange={pick}
        options={LANG_CODES.map((c) => ({ value: c, label: (isInstalled(c) ? '' : '⬇ ') + LANGUAGES[c].name }))} />
      {busy && <span className="hint">⏳</span>}
    </div>
  );
}
