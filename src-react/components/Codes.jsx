import { call } from '../../src/api.js';
import { toast, errMsg, prettyCode } from '../../src/helpers.js';

// קודי הצטרפות (הורים בלבד).
export default function Codes({ data, token }) {
  const f = data.family;

  async function share(title, code) {
    const text = `${title} לקופה של ${f.name}: ${prettyCode(code)}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('הועתק ✅');
    } catch (e) { /* בוטל */ }
  }

  async function rotate(which) {
    if (!confirm('להחליף את הקוד? מי שכבר בפנים נשאר, אבל הקוד הישן יפסיק לעבוד.')) return;
    try { await call('family:rotateCode', { token, which }); toast('הקוד הוחלף ✅'); }
    catch (e) { toast(errMsg(e)); }
  }

  const block = (label, hint, code, which, shareTitle) => (
    <div className="codeblock">
      <div className="meta">{label}</div>
      <div className="codeval" dir="ltr">{prettyCode(code)}</div>
      <p className="hint">{hint}</p>
      <div className="tools">
        <button className="small" type="button" onClick={() => share(shareTitle, code)}>שיתוף</button>
        <button className="small" type="button" onClick={() => rotate(which)}>החלפת קוד</button>
      </div>
    </div>
  );

  return (
    <div className="card codes">
      <h3>🔑 קודי הצטרפות</h3>
      {block('קוד לילדים', 'ילדים שמקלידים אותו מצטרפים בתור ילדים.', f.childCode, 'child', 'קוד ילדים')}
      {block('קוד להורים', 'להורה השני. מי שמקליד אותו מצטרף בתור הורה, אז לא לשתף עם ילדים.', f.parentCode, 'parent', 'קוד הורים')}
    </div>
  );
}
