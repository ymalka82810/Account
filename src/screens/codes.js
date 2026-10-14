import { state } from '../state.js';
import { $, el, prettyCode, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';

// ---------- קודי הצטרפות ----------
async function shareCode(title, code) {
  const text = `${title} לקופה של ${state.data.family.name}: ${prettyCode(code)}\n${location.origin}${location.pathname}`;
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('הועתק ✅');
  } catch (e) { /* בוטל */ }
}

export function renderCodes() {
  const f = state.data.family;
  const block = (label, hint, code, which, shareTitle) => el('div', { class: 'codeblock' },
    el('div', { class: 'meta', text: label }),
    el('div', { class: 'codeval', dir: 'ltr', text: prettyCode(code) }),
    el('p', { class: 'hint', text: hint }),
    el('div', { class: 'tools' },
      el('button', { class: 'small', type: 'button', text: 'שיתוף', onclick: () => shareCode(shareTitle, code) }),
      el('button', {
        class: 'small', type: 'button', text: 'החלפת קוד', onclick: async () => {
          if (!confirm('להחליף את הקוד? מי שכבר בפנים נשאר, אבל הקוד הישן יפסיק לעבוד.')) return;
          try { await call('family:rotateCode', { token: state.token, which }); toast('הקוד הוחלף ✅'); }
          catch (e) { toast(errMsg(e)); }
        },
      })));
  $('codesBox').replaceChildren(el('div', { class: 'card codes' },
    el('h3', { text: '🔑 קודי הצטרפות' }),
    block('קוד לילדים', 'ילדים שמקלידים אותו מצטרפים בתור ילדים.', f.childCode, 'child', 'קוד ילדים'),
    block('קוד להורים', 'להורה השני. מי שמקליד אותו מצטרף בתור הורה, אז לא לשתף עם ילדים.', f.parentCode, 'parent', 'קוד הורים')));
}
