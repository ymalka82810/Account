(() => {
  'use strict';

  const STORAGE_KEY = 'family-account-v1';
  const fmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' });
  const money = (agorot) => fmt.format(agorot / 100);
  const $ = (id) => document.getElementById(id);

  // ---------- state ----------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.people) && Array.isArray(s.entries)) return s;
      }
    } catch (e) { /* ignore */ }
    return { people: [], entries: [] };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('לא הצלחנו לשמור במכשיר הזה'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const person = (id) => state.people.find((p) => p.id === id);
  const nameOf = (id) => (person(id) ? person(id).name : 'לא ידוע');

  // ---------- helpers ----------
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && n.append(c));
    return n;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  const today = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  // ---------- calculations ----------
  // חוב: from חייב ל-to. החזר: from החזיר ל-to.
  // pairNet(a,b) > 0  =>  a חייב ל-b
  function openDebts() {
    const net = new Map(); // key "a|b" with a<b
    for (const e of state.entries) {
      const sign = e.kind === 'debt' ? 1 : -1;
      const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
      const dir = e.from === a ? 1 : -1;
      const key = a + '|' + b;
      net.set(key, (net.get(key) || 0) + sign * dir * e.amount);
    }
    const out = [];
    for (const [key, v] of net) {
      if (v === 0) continue;
      const [a, b] = key.split('|');
      out.push(v > 0 ? { debtor: a, creditor: b, amount: v } : { debtor: b, creditor: a, amount: -v });
    }
    return out.sort((x, y) => y.amount - x.amount);
  }

  function balances() {
    const bal = new Map(state.people.map((p) => [p.id, 0]));
    for (const d of openDebts()) {
      bal.set(d.creditor, (bal.get(d.creditor) || 0) + d.amount);
      bal.set(d.debtor, (bal.get(d.debtor) || 0) - d.amount);
    }
    return bal;
  }

  // ---------- render ----------
  function render() {
    renderBalances();
    renderDebts();
    renderHistory();
    renderPeople();
    fillSelects();
    updateFormLabels();
  }

  function renderBalances() {
    const box = $('balances');
    box.replaceChildren();
    const bal = balances();
    state.people.forEach((p) => {
      const v = bal.get(p.id) || 0;
      const cls = v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero';
      const what = v > 0 ? 'מגיע לו/ה' : v < 0 ? 'חייב/ת' : 'הכול מסודר';
      box.append(
        el('div', { class: 'bal ' + cls },
          el('div', { class: 'name', text: p.name }),
          el('div', { class: 'num', text: money(Math.abs(v)) }),
          el('div', { class: 'what', text: what }))
      );
    });
  }

  function renderDebts() {
    const box = $('debts');
    box.replaceChildren();
    if (state.people.length < 2) {
      box.append(el('div', { class: 'empty', text: 'כדי להתחיל, הוסיפו לפחות שני בני משפחה בלשונית "המשפחה".' }));
      return;
    }
    const list = openDebts();
    if (!list.length) {
      box.append(el('div', { class: 'empty', text: 'אף אחד לא חייב כלום. כשיהיה חוב חדש, הוסיפו אותו בלשונית "חוב חדש".' }));
      return;
    }
    list.forEach((d) => {
      box.append(
        el('div', { class: 'debt' },
          el('div', { class: 'text' },
            el('div', { class: 'who', text: `${nameOf(d.debtor)} חייב/ת ל${nameOf(d.creditor)}` }),
            el('div', { class: 'amt', text: money(d.amount) })),
          el('button', { class: 'small', onclick: () => startPayment(d, false), text: 'החזר חלקי' }),
          el('button', { class: 'small', onclick: () => startPayment(d, true), text: 'שולם הכול' }))
      );
    });
  }

  function renderHistory() {
    const box = $('history');
    box.replaceChildren();
    if (!state.entries.length) {
      box.append(el('div', { class: 'empty', text: 'עדיין אין רשומות.' }));
      return;
    }
    [...state.entries]
      .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
      .forEach((e) => {
        const isDebt = e.kind === 'debt';
        const title = isDebt
          ? `${nameOf(e.from)} חייב/ת ל${nameOf(e.to)}`
          : `${nameOf(e.from)} החזיר/ה ל${nameOf(e.to)}`;
        box.append(
          el('div', { class: 'row' },
            el('div', { class: 'text' },
              el('div', {}, el('span', { class: 'tag ' + e.kind, text: isDebt ? 'חוב' : 'החזר' }), ' ', title),
              el('div', { class: 'meta', text: [fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
            el('strong', { text: money(e.amount) }),
            el('button', {
              class: 'small danger', 'aria-label': 'מחיקת הרשומה',
              onclick: () => {
                if (confirm('למחוק את הרשומה הזאת?')) {
                  state.entries = state.entries.filter((x) => x.id !== e.id);
                  save(); render(); toast('הרשומה נמחקה');
                }
              }, text: 'מחיקה'
            }))
        );
      });
  }

  function renderPeople() {
    const box = $('peopleList');
    box.replaceChildren();
    if (!state.people.length) {
      box.append(el('div', { class: 'empty', text: 'עדיין אין בני משפחה. הוסיפו את הראשון למטה.' }));
      return;
    }
    state.people.forEach((p) => {
      box.append(
        el('div', { class: 'person' },
          el('div', { class: 'text' }, p.name, ' ',
            el('span', { class: 'meta', text: p.role === 'parent' ? 'הורה' : 'ילד/ה' })),
          el('button', {
            class: 'small danger', 'aria-label': 'הסרת ' + p.name,
            onclick: () => removePerson(p), text: 'הסרה'
          }))
      );
    });
  }

  function fillSelects() {
    ['from', 'to'].forEach((id) => {
      const sel = $(id);
      const prev = sel.value;
      sel.replaceChildren(el('option', { value: '', text: 'בחרו…' }));
      state.people.forEach((p) => sel.append(el('option', { value: p.id, text: p.name })));
      if (person(prev)) sel.value = prev;
    });
  }

  function updateFormLabels() {
    const isPay = document.querySelector('input[name=kind]:checked').value === 'payment';
    $('fromLabel').textContent = isPay ? 'מי מחזיר?' : 'מי חייב?';
    $('toLabel').textContent = isPay ? 'למי מחזירים?' : 'למי?';
    $('submitBtn').textContent = isPay ? 'שמירת ההחזר' : 'שמירת החוב';
  }

  // ---------- actions ----------
  function startPayment(d, full) {
    if (full) {
      addEntry({ kind: 'payment', from: d.debtor, to: d.creditor, amount: d.amount, note: 'סגירת חוב', date: today() });
      toast(`${nameOf(d.debtor)} סגר/ה את החוב`);
      return;
    }
    switchTab('add');
    document.querySelector('input[name=kind][value=payment]').checked = true;
    updateFormLabels();
    $('from').value = d.debtor;
    $('to').value = d.creditor;
    $('amount').value = '';
    $('amount').focus();
  }

  function addEntry(e) {
    state.entries.push({ id: uid(), ...e });
    save(); render();
  }

  function removePerson(p) {
    if (state.entries.some((e) => e.from === p.id || e.to === p.id)) {
      toast(`אי אפשר להסיר את ${p.name}: יש רשומות על שמו/ה. מחקו אותן קודם בהיסטוריה.`);
      return;
    }
    if (!confirm(`להסיר את ${p.name} מהמשפחה?`)) return;
    state.people = state.people.filter((x) => x.id !== p.id);
    save(); render();
  }

  // ---------- events ----------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  document.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', updateFormLabels));

  $('entryForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('formError');
    err.hidden = true;
    const kind = document.querySelector('input[name=kind]:checked').value;
    const from = $('from').value;
    const to = $('to').value;
    const amount = Math.round(parseFloat($('amount').value) * 100);
    const fail = (m) => { err.textContent = m; err.hidden = false; };

    if (!from || !to) return fail('בחרו מי ולמי.');
    if (from === to) return fail('אדם לא יכול להיות חייב לעצמו. בחרו שני אנשים שונים.');
    if (!Number.isFinite(amount) || amount <= 0) return fail('כתבו סכום גדול מאפס.');

    addEntry({ kind, from, to, amount, note: $('note').value.trim(), date: $('date').value || today() });
    $('amount').value = '';
    $('note').value = '';
    toast(kind === 'debt' ? 'החוב נשמר' : 'ההחזר נשמר');
    switchTab('overview');
  });

  $('personForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('personName').value.trim();
    if (!name) return;
    if (state.people.some((p) => p.name === name)) { toast('כבר יש מישהו בשם הזה'); return; }
    state.people.push({ id: uid(), name, role: $('personRole').value });
    $('personName').value = '';
    save(); render();
    toast(`${name} נוסף/ה למשפחה`);
  });

  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `kupa-backup-${today()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('importFile').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.people) || !Array.isArray(s.entries)) throw new Error('bad');
      if (!confirm('השחזור יחליף את כל הנתונים הנוכחיים. להמשיך?')) return;
      state = { people: s.people, entries: s.entries };
      save(); render(); toast('הנתונים שוחזרו');
    } catch (e) {
      toast('הקובץ לא נראה כמו גיבוי של הקופה');
    }
  });

  $('date').value = today();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
