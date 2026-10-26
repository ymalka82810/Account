import { useEffect, useRef, useState } from 'react';
import { call, useQuery } from '../../lib/api.js';
import { toast, errMsg, prettyCode } from '../../lib/helpers.js';
import { CODE_KEY } from '../../state/state.js';
import { useBioConfirm } from '../shared/BioConfirm.jsx';
import { BioError } from '../../lib/biometric.js';

// כמה זמן הקוד נשאר גלוי אחרי האימות.
const SHOW_MS = 30000;
const BIO_OPTS = {
  need: 'לראות את קוד ההצטרפות',
  title: 'הצגת קוד ההצטרפות',
  reason: 'קוד ההצטרפות של המשפחה נחשף רק בטביעת אצבע או בזיהוי פנים.',
};

// קוד ההצטרפות היחיד של המשפחה (הורים בלבד). כל מי שמצטרף/ת איתו נכנס/ת בתור ילד/ה,
// ואז הורה קובע/ת את התפקיד ב"בני המשפחה" (ילד/ה, נער/ה או הורה), באישור ביומטרי.
// הקוד מוסתר ונחשף רק אחרי טביעת אצבע / זיהוי פנים; השרת לא שולח אותו בלי האישור.
export default function Codes({ data, token }) {
  const f = data.family;
  const bioConfirm = useBioConfirm();
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const hide = () => { clearTimeout(timer.current); setCode(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  // הסתרה כשעוברים לאפליקציה אחרת או נועלים את המסך.
  useEffect(() => {
    const onVis = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // מחזיר את הקוד אחרי אימות, או null אם בוטל / נכשל.
  async function reveal() {
    if (code) return code;
    setBusy(true);
    try {
      const proof = await bioConfirm('reveal-code', BIO_OPTS);
      const res = await call('family:revealCode', { token, proof });
      setCode(res.code);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCode(null), SHOW_MS);
      return res.code;
    } catch (e) {
      if (!(e instanceof BioError && e.code === 'cancel')) toast(e instanceof BioError ? e.message : errMsg(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const c = await reveal();
    if (!c) return;
    const text = `קוד ההצטרפות לקופה של ${f.name}: ${prettyCode(c)}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('הועתק ✅');
    } catch (e) { /* בוטל */ }
  }

  async function rotate() {
    if (!confirm('להחליף את הקוד? מי שכבר בפנים נשאר, אבל הקוד הישן יפסיק לעבוד, ומכשירים אחרים ששמרו את המשפחה יצטרכו להזין את הקוד החדש.')) return;
    try {
      const keepDevice = !!localStorage.getItem(CODE_KEY);
      const res = await call('family:rotateCode', { token, keepDevice });
      hide();
      // כל המכשירים ששמרו את המשפחה צריכים להזין את הקוד החדש. המכשיר הזה מקבל כרטיס חדש.
      if (res?.loginCode) localStorage.setItem(CODE_KEY, res.loginCode);
      toast('הקוד הוחלף ✅ אפשר להציג אותו בטביעת אצבע או זיהוי פנים');
    } catch (e) { toast(errMsg(e)); }
  }

  const devices = useQuery('auth:listDevices', { token });
  const fmtDay = (t) => new Date(t).toLocaleDateString('he-IL');
  async function revoke(id) {
    if (!confirm('לנתק את המכשיר? הוא יצטרך להזין שוב את קוד ההצטרפות.')) return;
    try { await call('auth:revokeDevice', { token, deviceId: id }); toast('המכשיר נותק ✅'); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="codes">
      <div className="codeblock">
        <div className="meta">קוד ההצטרפות של המשפחה</div>
        <div className={'codeval' + (code ? '' : ' masked')} dir="ltr" aria-label={code ? undefined : 'הקוד מוסתר'}>
          {code ? prettyCode(code) : '•••••-•••••'}
        </div>
        <p className="hint">
          קוד אחד לכולם. מי שמצטרף/ת איתו נכנס/ת בתור ילד/ה. אחר כך אפשר לשנות ב&quot;בני המשפחה&quot;
          לנער/ה או להורה, באישור טביעת אצבע או זיהוי פנים.
          {' '}הקוד מוסתר ונחשף רק בטביעת אצבע או בזיהוי פנים.
        </p>
        <div className="tools">
          {code
            ? <button className="small" type="button" onClick={hide}>הסתרה</button>
            : <button className="small" type="button" onClick={reveal} disabled={busy}>{busy ? 'מאמתים…' : 'הצגת הקוד 🔒'}</button>}
          <button className="small" type="button" onClick={share} disabled={busy}>שיתוף</button>
          <button className="small" type="button" onClick={rotate} disabled={busy}>החלפת קוד</button>
        </div>
      </div>
      {devices?.length > 0 && (
        <div className="codeblock">
          <div className="meta">מכשירים מחוברים</div>
          <p className="hint">מכשירים ששמרו את המשפחה. כרטיס שלא בשימוש 180 יום פג מעצמו.</p>
          {devices.map((d) => (
            <div className="tools" key={d.id}>
              <span>{d.label || 'מכשיר'} · נראה לאחרונה {fmtDay(d.lastUsedAt ?? d.createdAt)}</span>
              <button className="small" type="button" onClick={() => revoke(d.id)}>ניתוק</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
