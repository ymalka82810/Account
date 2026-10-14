import { LEGACY_KEY, LEGACY_DONE_KEY } from '../state.js';

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
