import { state, LEGACY_KEY, LEGACY_DONE_KEY } from '../state.js';
import { $, el, errMsg, toast } from '../helpers.js';
import { call } from '../api.js';

// ---------- נתונים ישנים מהמכשיר ----------
export function readLegacy() {
  if (localStorage.getItem(LEGACY_DONE_KEY)) return null;
  try {
    const s = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (s && Array.isArray(s.people) && Array.isArray(s.entries) && (s.people.length || s.entries.length)) return s;
  } catch (e) { /* ignore */ }
  return null;
}

export function cleanPayload(s) {
  return {
    people: s.people.map((p) => ({ id: String(p.id), name: String(p.name), role: p.role === 'parent' ? 'parent' : 'child' })),
    entries: s.entries.map((e) => ({
      kind: e.kind === 'payment' ? 'payment' : 'debt', from: String(e.from), to: String(e.to),
      amount: Number(e.amount), note: e.note ? String(e.note) : undefined, date: String(e.date),
    })),
  };
}

export function renderLegacy() {
  const box = $('legacyBox');
  box.replaceChildren();
  const s = readLegacy();
  if (!s) return;
  box.append(el('div', { class: 'card notice' },
    el('p', { text: `נמצאו במכשיר הזה נתונים מהגרסה הקודמת: ${s.people.length} אנשים ו-${s.entries.length} רשומות. להעביר אותם לשרת?` }),
    el('p', { class: 'hint', text: 'האנשים שיתווספו יבחרו קוד סודי בכניסה הראשונה שלהם.' }),
    el('button', {
      class: 'primary', type: 'button', text: 'העברה לשרת', onclick: async () => {
        try {
          const res = await call('admin:importData', { token: state.token, ...cleanPayload(s) });
          localStorage.setItem(LEGACY_DONE_KEY, '1');
          toast(`הועברו ${res.added} רשומות`);
          renderLegacy();
        } catch (e) { toast(errMsg(e)); }
      },
    })));
}
