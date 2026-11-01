// כרטיסי הכניסה של המשפחות שהמכשיר הזה מכיר. לכל משפחה כרטיס אחד, והוא נשאר במכשיר
// עד שמוחקים את האפליקציה (או שהורה מסיר את המכשיר). מעבר בין משפחות לא מבקש קוד משפחה,
// ורק הקוד הסודי האישי של מי שנכנס. הכרטיס פותח רק את מסך הבחירה במשפחה, לא את הנתונים.

export const CARDS_KEY = 'kupa-cards';

/** @typedef {{ familyId: string, name: string, card: string }} FamilyCard */

/** @returns {FamilyCard[]} */
export function getCards() {
  try {
    const list = JSON.parse(localStorage.getItem(CARDS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((c) => c && c.familyId && c.card) : [];
  } catch (e) { return []; }
}

function save(list) {
  try { localStorage.setItem(CARDS_KEY, JSON.stringify(list)); } catch (e) { /* מצב פרטי */ }
}

/** @param {FamilyCard} c */
export function upsertCard(c) {
  const list = getCards();
  const i = list.findIndex((x) => x.familyId === c.familyId);
  if (i >= 0) { if (list[i].card === c.card && list[i].name === c.name) return; list[i] = c; } else list.push(c);
  save(list);
}

export function removeCard(card) {
  const list = getCards();
  const next = list.filter((c) => c.card !== card);
  if (next.length !== list.length) save(next);
}

/** כל המשפחות שהמכשיר מכיר: מי שיש לה כניסה פעילה (token) ו/או כרטיס. */
export function savedFamilies(memberships, exceptFamilyId) {
  const byId = new Map();
  for (const c of getCards()) byId.set(c.familyId, { familyId: c.familyId, name: c.name, card: c.card, token: '' });
  for (const m of memberships) {
    if (!m.familyId) continue;
    const cur = byId.get(m.familyId);
    byId.set(m.familyId, { familyId: m.familyId, name: m.familyName, card: cur ? cur.card : '', token: m.token });
  }
  return [...byId.values()].filter((f) => f.familyId !== exceptFamilyId);
}
