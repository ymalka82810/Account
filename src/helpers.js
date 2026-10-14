// ---------- עזרי עיצוב ו-DOM כלליים ----------

export const fmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' });
export const money = (agorot) => fmt.format(agorot / 100);
export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'onclick' && tag === 'button' && v.constructor.name === 'AsyncFunction') {
      // כפתור עם פעולה אסינכרונית: נועלים ומראים "שולח…" עד שהשרת עונה
      n.addEventListener('click', async (ev) => {
        if (n.disabled) return;
        const label = n.textContent;
        n.disabled = true;
        n.classList.add('busy');
        n.textContent = '⏳ רגע…';
        n.setAttribute('aria-busy', 'true');
        try { await v(ev); }
        finally {
          n.disabled = false;
          n.classList.remove('busy');
          n.removeAttribute('aria-busy');
          if (n.textContent === '⏳ רגע…') n.textContent = label;
        }
      });
    }
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') n[k] = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
}

// נועל כפתור קיים (submit/click) בזמן פעולה אסינכרונית ומראה "⏳ רגע…",
// כדי שלא יהיה אפשר ללחוץ כמה פעמים בזמן ההמתנה לשרת.
export function withBusy(btn, fn) {
  return async (ev) => {
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.textContent = '⏳ רגע…';
    btn.setAttribute('aria-busy', 'true');
    try { await fn(ev); }
    finally {
      btn.disabled = false;
      btn.classList.remove('busy');
      btn.removeAttribute('aria-busy');
      if (btn.textContent === '⏳ רגע…') btn.textContent = label;
    }
  };
}

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

export const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

// שגיאות מהשרת מגיעות כ-ConvexError עם טקסט בעברית ב-data.
export function errMsg(e) {
  if (e && typeof e.data === 'string') return e.data;
  if (!navigator.onLine) return 'אין חיבור לאינטרנט. נסו שוב כשיש.';
  return 'משהו השתבש. נסו שוב.';
}

// "דקה", "5 דקות", "שעה"... לפי מספר השניות שנשארו בנעילה.
export function fmtWait(sec) {
  if (sec < 90) return 'דקה';
  if (sec < 3600) return Math.round(sec / 60) + ' דקות';
  const h = Math.round(sec / 3600);
  return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות';
}

export function prettyCode(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > 5 ? c.slice(0, 5) + '-' + c.slice(5) : c;
}

// ---------- בורר דמות ----------
export function avatarPicker(container, AVATARS) {
  let chosen = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const draw = () => {
    container.replaceChildren(...AVATARS.map((a) => el('button', {
      type: 'button', class: 'av' + (a === chosen ? ' on' : ''), text: a,
      'aria-label': 'דמות ' + a, 'aria-pressed': String(a === chosen),
      onclick: () => { chosen = a; draw(); },
    })));
  };
  draw();
  return { get: () => chosen };
}
