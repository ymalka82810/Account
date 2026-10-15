import { call } from '../../lib/api.js';
import { toast, errMsg, prettyCode } from '../../lib/helpers.js';

// קוד ההצטרפות היחיד של המשפחה (הורים בלבד). כל מי שמצטרף/ת איתו נכנס/ת בתור ילד/ה,
// ואז הורה קובע/ת את התפקיד ב"בני המשפחה" (ילד/ה, נער/ה או הורה), באישור ביומטרי.
export default function Codes({ data, token }) {
  const f = data.family;

  async function share() {
    const text = `קוד ההצטרפות לקופה של ${f.name}: ${prettyCode(f.code)}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('הועתק ✅');
    } catch (e) { /* בוטל */ }
  }

  async function rotate() {
    if (!confirm('להחליף את הקוד? מי שכבר בפנים נשאר, אבל הקוד הישן יפסיק לעבוד.')) return;
    try { await call('family:rotateCode', { token }); toast('הקוד הוחלף ✅'); }
    catch (e) { toast(errMsg(e)); }
  }

  return (
    <div className="codes">
      <div className="codeblock">
        <div className="meta">קוד ההצטרפות של המשפחה</div>
        <div className="codeval" dir="ltr">{prettyCode(f.code)}</div>
        <p className="hint">
          קוד אחד לכולם. מי שמצטרף/ת איתו נכנס/ת בתור ילד/ה. אחר כך אפשר לשנות ב&quot;בני המשפחה&quot;
          לנער/ה או להורה, באישור טביעת אצבע או זיהוי פנים.
        </p>
        <div className="tools">
          <button className="small" type="button" onClick={share}>שיתוף</button>
          <button className="small" type="button" onClick={rotate}>החלפת קוד</button>
        </div>
      </div>
    </div>
  );
}
