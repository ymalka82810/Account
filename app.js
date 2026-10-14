(() => {
  'use strict';

  const TOKEN_KEY = 'kupa-token';
  const LEGACY_KEY = 'family-account-v1';
  const LEGACY_DONE_KEY = 'kupa-legacy-imported';
  const CODE_KEY = 'kupa-code';
  const DEVICE_KEY = 'kupa-device';
  const UNDO_MS = 10 * 60 * 1000;
  const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🐨', '🐶', '🐱', '🚀', '😎', '🎧', '🛹', '⚡', '🔥', '🎮'];

  const fmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' });
  const money = (agorot) => fmt.format(agorot / 100);
  const $ = (id) => document.getElementById(id);

  // ---------- state ----------
  let client = null;
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let legacyPeople = null; // null = עוד לא נטען. הורים מהגרסה הישנה (בלי קוד משפחה)
  let codeChecked = false; // האם בדקנו קוד שמור במכשיר
  let fam = null;         // {code, name, codeRole, people} אחרי שהוזן קוד משפחה תקין
  let view = 'welcome';   // welcome | setup | join
  let data = undefined;   // undefined = נטען, null = כניסה לא תקפה
  let pinFlow = null;     // {person, legacy, mode:'login'|'new', first, entered, busy}
  let unsubData = null;
  let migrating = false;
  let fdata = null;        // נתוני מצב חברים (friends:get): בני נוער רואים חברים, הורים רואים סקירה
  let unsubFriends = null;
  let tabInit = false;     // הלשונית ההתחלתית נבחרת פעם אחת בכל כניסה

  // ---------- helpers ----------
  function el(tag, props = {}, ...kids) {
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
  function withBusy(btn, fn) {
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
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  const today = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

  // שגיאות מהשרת מגיעות כ-ConvexError עם טקסט בעברית ב-data.
  function errMsg(e) {
    if (e && typeof e.data === 'string') return e.data;
    if (!navigator.onLine) return 'אין חיבור לאינטרנט. נסו שוב כשיש.';
    return 'משהו השתבש. נסו שוב.';
  }

  // מזהה מכשיר אקראי, רק להגבלת קצב של ניחושי קוד (לא מזהה אישי).
  function deviceId() {
    try {
      let d = localStorage.getItem(DEVICE_KEY);
      if (!d) {
        const a = new Uint8Array(16);
        crypto.getRandomValues(a);
        d = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(DEVICE_KEY, d);
      }
      return d;
    } catch (e) { return undefined; }
  }
  const AUTH_CALLS = ['auth:enter', 'auth:join', 'auth:login', 'auth:claimProfile', 'emailAuth:requestResetCode', 'emailAuth:resetWithCode'];
  const call = (name, args) => client.mutation(name, AUTH_CALLS.includes(name) ? { ...args, device: deviceId() } : args);

  // "דקה", "5 דקות", "שעה"... לפי מספר השניות שנשארו בנעילה.
  function fmtWait(sec) {
    if (sec < 90) return 'דקה';
    if (sec < 3600) return Math.round(sec / 60) + ' דקות';
    const h = Math.round(sec / 3600);
    return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות';
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name !== 'app') applyTheme('');
    window.scrollTo({ top: 0 });
  }

  // ---------- חישובים ----------
  const person = (id) => (data
    ? (data.people.find((p) => p.id === id) || (fdata && fdata.people && fdata.people[id]) || null)
    : null);
  const isMe = (id) => !!data && id === data.me.id;
  const isParent = () => !!data && data.me.role === 'parent';
  const isTeen = () => !!data && data.me.role === 'teen';
  const roleLabel = (r) => (r === 'parent' ? 'הורה' : r === 'teen' ? 'נער/ה' : 'ילד/ה');
  const nameOf = (id) => (person(id) ? person(id).name : 'לא ידוע');
  const subjectWord = (id) => (isMe(id) ? 'אני' : nameOf(id));
  const toWord = (id) => (isMe(id) ? 'לי' : 'ל' + nameOf(id));

  // רשומה שילד/ה יצר/ה וממתינה לאישור הורה. היא לא נספרת ביתרות.
  const isPending = (e) => e.status === 'pending';

  // כמה a חייב ל-b (יכול להיות שלילי)
  function pairOwes(a, b, list = data.entries) {
    let sum = 0;
    for (const e of list) {
      if (isPending(e)) continue;
      const sign = e.kind === 'debt' ? 1 : -1;
      if (e.from === a && e.to === b) sum += sign * e.amount;
      else if (e.from === b && e.to === a) sum -= sign * e.amount;
    }
    return sum;
  }

  function openDebts() {
    const out = [];
    const ps = data.people;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const n = pairOwes(ps[i].id, ps[j].id);
        if (n > 0) out.push({ debtor: ps[i].id, creditor: ps[j].id, amount: n });
        else if (n < 0) out.push({ debtor: ps[j].id, creditor: ps[i].id, amount: -n });
      }
    }
    return out.sort((x, y) => y.amount - x.amount);
  }

  // מצב כל חוב: כמה שולם וכמה נשאר. החזר שקשור לחוב (debtId) מקטין אותו ישירות.
  // החזרים כלליים (בלי debtId) מנוכים מהחובות הישנים ביותר באותו כיוון.
  function debtStates(list = data.entries) {
    const byId = new Map();
    const order = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
    const debts = list.filter((e) => e.kind === 'debt' && !isPending(e)).sort(order);
    for (const d of debts) byId.set(d.id, { debt: d, paid: 0, remaining: d.amount });
    for (const e of list) {
      if (e.kind !== 'payment' || isPending(e) || !e.debtId) continue;
      const st = byId.get(e.debtId);
      if (st) { st.paid += e.amount; st.remaining = Math.max(0, st.debt.amount - st.paid); }
    }
    for (const e of [...list].sort(order)) {
      if (e.kind !== 'payment' || isPending(e) || e.debtId) continue;
      let left = e.amount;
      for (const d of debts) {
        if (left <= 0) break;
        if (d.from !== e.from || d.to !== e.to) continue;
        const st = byId.get(d.id);
        const take = Math.min(left, st.remaining);
        st.paid += take; st.remaining -= take; left -= take;
      }
    }
    return byId;
  }

  // חובות פתוחים של a ל-b (מה שעוד נשאר), מהישן לחדש.
  function openDebtsOf(a, b, list = data.entries) {
    return [...debtStates(list).values()]
      .filter((x) => x.debt.from === a && x.debt.to === b && x.remaining > 0)
      .sort((x, y) => x.debt.date.localeCompare(y.debt.date) || x.debt.createdAt - y.debt.createdAt);
  }

  const debtLabel = (d) => (d.note || 'חוב') + ' • ' + fmtDate(d.date);

  // ---------- ניתוב בין מסכים ----------
  function route() {
    if (token) {
      if (data === undefined) return show('loading');
      renderApp();
      return show('app');
    }
    if (legacyPeople === null || !codeChecked) return show('loading');
    if (pinFlow) return show('pin');
    if (view === 'setup') { initSetup(); return show('setup'); }
    if (view === 'join' && fam) { initJoin(); return show('join'); }
    if (fam) { renderLogin(); return show('login'); }
    renderWelcome();
    show('welcome');
  }

  function subscribeData() {
    if (unsubData) { unsubData(); unsubData = null; }
    if (unsubFriends) { unsubFriends(); unsubFriends = null; }
    data = undefined;
    fdata = null;
    if (!token) return;
    unsubFriends = client.onUpdate('friends:get', { token }, (d) => {
      fdata = d || null;
      if (data) renderApp();
    }, () => {});
    unsubData = client.onUpdate('data:get', { token }, (d) => {
      if (d === null) { dropSession(); return; }
      if (d.legacy) { handleLegacySession(d); return; }
      data = d;
      route();
    }, () => {});
  }

  // חשבון מהגרסה הישנה (בלי משפחה): הורה מעביר את הקופה למשפחה עם קודים. ילדים נכנסים מחדש עם קוד.
  async function handleLegacySession(d) {
    if (!d.canMigrate) { toast('צריך להיכנס מחדש עם קוד המשפחה'); dropSession(); return; }
    if (migrating) return;
    migrating = true;
    try { await call('auth:migrateMe', { token }); }
    catch (e) { dropSession(); }
    finally { migrating = false; }
  }

  function setToken(t) {
    token = t;
    localStorage.setItem(TOKEN_KEY, t);
    closeSheet();
    subscribeData();
    route();
  }

  function dropSession() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    if (unsubData) { unsubData(); unsubData = null; }
    if (unsubFriends) { unsubFriends(); unsubFriends = null; }
    data = undefined;
    fdata = null;
    tabInit = false;
    pinFlow = null;
    closeSheet();
    codeChecked = false;
    route();
    restoreFamily().finally(() => { codeChecked = true; route(); });
  }

  // ---------- בורר דמות ----------
  function avatarPicker(container) {
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

  // ---------- מסך פתיחה: קוד משפחה ----------
  const showCodeError = (msg) => { const e = $('codeError'); e.textContent = msg; e.hidden = !msg; };

  function prettyCode(code) {
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length > 5 ? c.slice(0, 5) + '-' + c.slice(5) : c;
  }

  function renderWelcome() {
    const box = $('legacyLogin');
    const parents = legacyPeople || [];
    box.hidden = parents.length === 0;
    $('legacyTiles').replaceChildren(...parents.map((p) => el('button', {
      class: 'tile', type: 'button', onclick: () => startPin(p, true),
    }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name }))));
  }

  // בודק קוד מול השרת. מחזיר true אם נכנסנו למשפחה.
  async function enterFamily(code, remember) {
    const res = await call('auth:enter', { code });
    if (!res.ok) return res.reason;
    fam = { code, name: res.familyName, codeRole: res.codeRole, people: res.people };
    // שומרים במכשיר רק את קוד הילדים, כדי שקוד הורים לא יישאר על מכשיר משותף.
    if (remember) localStorage.setItem(CODE_KEY, res.loginCode);
    return true;
  }

  // קוד ילדים שמור במכשיר: מרעננים את רשימת המשפחה, ואם הקוד הוחלף מוחקים אותו.
  async function restoreFamily() {
    const saved = localStorage.getItem(CODE_KEY);
    if (!saved) return;
    try {
      const r = await enterFamily(saved, false);
      if (r !== true && r !== 'throttled') { localStorage.removeItem(CODE_KEY); fam = null; }
    } catch (e) { /* בלי חיבור: נשארים עם מה שיש */ }
  }

  $('codeInput').addEventListener('input', (ev) => { ev.target.value = prettyCode(ev.target.value); showCodeError(''); });
  $('codeForm').addEventListener('submit', withBusy($('codeForm').querySelector('button[type=submit]'), async (ev) => {
    ev.preventDefault();
    showCodeError('');
    try {
      const r = await enterFamily($('codeInput').value, true);
      if (r === true) { $('codeInput').value = ''; view = 'welcome'; route(); }
      else if (r === 'throttled') showCodeError('יותר מדי ניסיונות. נסו שוב עוד דקה.');
      else showCodeError('הקוד לא נכון. בדקו שוב, או בקשו מההורים.');
    } catch (e) { showCodeError(errMsg(e)); }
  }));

  $('newFamilyBtn').addEventListener('click', () => { view = 'setup'; route(); });

  // ---------- הקמת משפחה חדשה ----------
  let setupPicker = null;
  function initSetup() {
    if (!setupPicker) setupPicker = avatarPicker($('setupAvatars'));
  }
  $('setupBack').addEventListener('click', () => { view = 'welcome'; route(); });
  $('setupForm').addEventListener('submit', withBusy($('setupForm').querySelector('button[type=submit]'), async (ev) => {
    ev.preventDefault();
    const err = $('setupError');
    err.hidden = true;
    try {
      const res = await call('auth:createFamily', {
        familyName: $('setupFamily').value, name: $('setupName').value,
        avatar: setupPicker.get(), pin: $('setupPin').value,
      });
      $('setupPin').value = '';
      view = 'welcome';
      setToken(res.token);
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
  }));

  // ---------- הצטרפות עם קוד ----------
  let joinPicker = null;
  function initJoin() {
    if (!joinPicker) joinPicker = avatarPicker($('joinAvatars'));
    $('joinHint').textContent = fam.codeRole === 'parent'
      ? `מצטרפים לקופה של ${fam.name} בתור הורה.`
      : `מצטרפים לקופה של ${fam.name} בתור ילד/ה.`;
  }
  $('joinBack').addEventListener('click', () => { view = 'welcome'; route(); });
  $('joinForm').addEventListener('submit', withBusy($('joinForm').querySelector('button[type=submit]'), async (ev) => {
    ev.preventDefault();
    const err = $('joinError');
    err.hidden = true;
    try {
      const res = await call('auth:join', {
        code: fam.code, name: $('joinName').value, avatar: joinPicker.get(), pin: $('joinPin').value,
      });
      if (!res.ok) {
        err.textContent = res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד דקה.' : 'הקוד כבר לא תקף. בקשו קוד חדש מההורים.';
        err.hidden = false;
        if (res.reason === 'code') leaveFamily();
        return;
      }
      $('joinPin').value = ''; $('joinName').value = '';
      view = 'welcome';
      setToken(res.token);
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
  }));

  function leaveFamily() {
    fam = null;
    view = 'welcome';
    pinFlow = null;
    localStorage.removeItem(CODE_KEY);
    route();
  }

  // ---------- בחירת פרופיל ----------
  function renderLogin() {
    $('loginFamily').textContent = fam.name;
    const tiles = fam.people.map((p) => el('button', {
      class: 'tile', type: 'button', onclick: () => startPin(p, false),
    }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name })));
    tiles.push(el('button', {
      class: 'tile', type: 'button', onclick: () => { view = 'join'; route(); },
    }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: '➕' }), el('span', { class: 'tname', text: 'אני חדש/ה' })));
    $('loginTiles').replaceChildren(...tiles);
  }
  $('loginBack').addEventListener('click', leaveFamily);

  // ---------- קוד סודי ----------
  function buildPad() {
    const pad = $('pinPad');
    if (pad.childElementCount) return;
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach((k) => {
      if (k === '') { pad.append(el('span')); return; }
      pad.append(el('button', {
        type: 'button', class: 'key' + (k === 'del' ? ' del' : ''),
        'aria-label': k === 'del' ? 'מחיקה' : k, text: k === 'del' ? '⌫' : k,
        onclick: () => pressKey(k),
      }));
    });
  }

  function startPin(p, legacy) {
    pinFlow = { person: p, legacy: !!legacy, mode: p.hasPin ? 'login' : 'new', first: null, entered: '', busy: false };
    buildPad();
    renderPin();
    route();
  }

  function renderPin(error = '') {
    const f = pinFlow;
    if (!f) return;
    $('pinAvatar').textContent = f.person.avatar;
    $('pinName').textContent = f.person.name;
    $('pinTitle').textContent = f.mode === 'login'
      ? 'כתבו את הקוד הסודי'
      : f.first ? 'כתבו את הקוד שוב, לאישור' : 'בחרו קוד סודי חדש (4 ספרות)';
    $('pinDots').replaceChildren(...[0, 1, 2, 3].map((i) => el('span', { class: 'dot' + (i < f.entered.length ? ' on' : '') })));
    $('pinDots').classList.toggle('busy', !!f.busy);
    $('pinError').textContent = f.busy ? 'בודקים…' : error;
    $('forgotPinBtn').hidden = !(f.mode === 'login' && f.person.role === 'parent' && !f.legacy);
  }

  function shake() {
    const d = $('pinDots');
    d.classList.remove('shake');
    void d.offsetWidth;
    d.classList.add('shake');
  }

  async function pressKey(k) {
    const f = pinFlow;
    if (!f || f.busy) return;
    if (k === 'del') f.entered = f.entered.slice(0, -1);
    else if (f.entered.length < 4) f.entered += k;
    renderPin();
    if (f.entered.length === 4) await submitPin();
  }

  // קוד משפחה שהפסיק להיות תקף באמצע הכניסה (ההורים החליפו אותו).
  function codeGone() {
    toast('קוד המשפחה השתנה. בקשו קוד חדש מההורים.');
    leaveFamily();
  }

  async function submitPin() {
    const f = pinFlow;
    f.busy = true;
    renderPin();
    const code = f.legacy ? undefined : fam.code;
    try {
      if (f.mode === 'login') {
        const res = await call('auth:login', { code, personId: f.person.id, pin: f.entered });
        if (res.ok) { pinFlow = null; setToken(res.token); return; }
        f.entered = '';
        if (res.reason === 'code') { codeGone(); return; }
        if (res.reason === 'wrong') renderPin(`הקוד לא נכון. נשארו עוד ${res.left} ניסיונות.`);
        else if (res.reason === 'locked') renderPin(`ניסיתם יותר מדי פעמים. נסו שוב בעוד ${fmtWait(res.waitSeconds)}.`);
        else if (res.reason === 'throttled') renderPin('יותר מדי ניסיונות. נסו שוב עוד דקה.');
        else if (res.reason === 'legacy') renderPin('הורה צריך להיכנס קודם.');
        else { f.mode = 'new'; renderPin(); }
        shake();
      } else if (!f.first) {
        f.first = f.entered; f.entered = '';
        renderPin();
      } else if (f.first !== f.entered) {
        f.first = null; f.entered = '';
        renderPin('הקודים לא היו זהים. נתחיל מחדש.');
        shake();
      } else {
        const res = await call('auth:claimProfile', { code, personId: f.person.id, pin: f.entered });
        if (!res.ok) {
          if (res.reason === 'code') { codeGone(); return; }
          f.first = null; f.entered = '';
          renderPin(res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד דקה.' : 'הורה צריך להיכנס קודם.');
          shake();
          return;
        }
        pinFlow = null;
        setToken(res.token);
        return;
      }
    } catch (e) {
      f.entered = ''; f.first = null;
      renderPin(errMsg(e));
      shake();
    } finally {
      f.busy = false;
    }
  }

  $('pinBack').addEventListener('click', () => { pinFlow = null; route(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('sheetWrap').hidden) { closeSheet(); return; }
    if (!pinFlow || token || !$('screen-pin').classList.contains('active')) return;
    if (/^\d$/.test(ev.key)) pressKey(ev.key);
    else if (ev.key === 'Backspace') pressKey('del');
  });

  // ---------- חלון קופץ ----------
  let sheetReturnFocus = null;
  function openSheet(title, body) {
    sheetReturnFocus = document.activeElement;
    $('sheetTitle').textContent = title;
    $('sheetBody').replaceChildren(body);
    $('sheetWrap').hidden = false;
    document.body.classList.add('noscroll');
    $('sheetClose').focus();
  }
  function closeSheet() {
    if ($('sheetWrap').hidden) return;
    $('sheetWrap').hidden = true;
    $('sheetBody').replaceChildren();
    document.body.classList.remove('noscroll');
    if (sheetReturnFocus && sheetReturnFocus.focus) sheetReturnFocus.focus();
    sheetReturnFocus = null;
  }
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetBg').addEventListener('click', closeSheet);

  // ---------- אשף: חוב חדש / החזר ----------
  // opts: {kind:'debt'|'payment', from?, to?, suggest?}  (חסר from או to => בוחרים אדם)
  function openEntryFlow(opts) {
    const st = { from: opts.from || null, to: opts.to || null, amount: '', agorot: 0, note: '', debtId: null, debtRemaining: null, debtName: '' };
    const body = el('div', { class: 'flow' });
    // סכום מקסימלי להחזר: אם נבחר חוב מסוים, מה שנשאר ממנו. אחרת היתרה הכללית.
    const maxFor = () => (st.debtRemaining != null ? st.debtRemaining : (opts.kind === 'payment' && opts.suggest ? opts.suggest : null));
    let opened = false;

    const titleFor = () => {
      if (opts.kind === 'debt') return isMe(st.from) ? 'אני חייב/ת כסף' : 'חייבים לי כסף';
      return isMe(st.from) ? 'שילמתי' : isMe(st.to) ? 'קיבלתי כסף' : 'רישום החזר';
    };

    const entriesNow = () => (opts.entries ? opts.entries() : data.entries);
    const pickDebt = (x) => {
      st.debtId = x.debt.id; st.debtRemaining = x.remaining; st.debtName = debtLabel(x.debt);
      stepAmount();
    };

    // אחרי שיש שני אנשים: בהחזר בוחרים לאיזה חוב מחזירים (אם יש כמה). אחרת ממשיכים לסכום.
    function afterPeople() {
      if (opts.kind !== 'payment' || opts.noDebtPick) return stepAmount();
      if (opts.debtId) {
        const hit = openDebtsOf(st.from, st.to, entriesNow()).find((x) => x.debt.id === opts.debtId);
        if (hit) return pickDebt(hit);
      }
      const open = openDebtsOf(st.from, st.to, entriesNow());
      if (open.length === 1) return pickDebt(open[0]);
      if (open.length > 1) return stepDebt(open);
      return stepAmount();
    }

    function stepDebt(open) {
      body.replaceChildren(
        el('p', { class: 'flow-q', text: 'לאיזה חוב ההחזר?' }),
        el('div', { class: 'debt-picks' }, open.map((x) => el('button', {
          class: 'debt-pick', type: 'button', onclick: () => pickDebt(x),
        },
        el('div', { class: 'dp-name', text: debtLabel(x.debt) }),
        el('div', { class: 'dp-amt', text: x.paid > 0
          ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}`
          : money(x.remaining) })))),
      );
      openOrUpdate();
    }

    function openOrUpdate() {
      if (opened) { $('sheetTitle').textContent = titleFor(); return; }
      opened = true;
      openSheet(titleFor(), body);
    }

    function stepPerson() {
      const fixed = st.from || st.to;
      const others = (opts.people || data.people).filter((p) => p.id !== fixed);
      const q = opts.kind === 'debt'
        ? (isMe(st.from) ? 'למי אני חייב/ת?' : 'מי חייב/ת לי?')
        : 'עם מי?';
      body.replaceChildren(
        el('p', { class: 'flow-q', text: q }),
        el('div', { class: 'tiles' }, others.map((p) => el('button', {
          class: 'tile', type: 'button',
          onclick: () => { if (st.from) st.to = p.id; else st.from = p.id; afterPeople(); },
        }, el('span', { class: 'avatar-lg', 'aria-hidden': 'true', text: p.avatar }), el('span', { class: 'tname', text: p.name })))),
      );
      openOrUpdate();
    }

    function stepAmount() {
      const meIsFrom = isMe(st.from);
      const other = meIsFrom ? st.to : st.from;
      const disp = el('div', { class: 'amount-display', 'aria-live': 'polite' });
      const err = el('p', { class: 'error', role: 'alert' });
      const refresh = () => { disp.textContent = '₪' + (st.amount || '0'); };

      const press = (k) => {
        err.textContent = '';
        let a = st.amount;
        if (k === 'del') a = a.slice(0, -1);
        else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
        else {
          const [i, d] = a.split('.');
          if (d !== undefined ? d.length < 2 : i.length < 5) a = a === '0' ? k : a + k;
        }
        st.amount = a;
        refresh();
      };

      const chips = [5, 10, 20, 50].map((n) => el('button', {
        type: 'button', class: 'chip', text: '₪' + n,
        onclick: () => { st.amount = String(n); err.textContent = ''; refresh(); },
      }));
      const maxAmount = maxFor();
      if (maxAmount) {
        chips.push(el('button', {
          type: 'button', class: 'chip strong', text: 'הכול ' + money(maxAmount),
          onclick: () => { st.amount = String(maxAmount / 100); err.textContent = ''; refresh(); },
        }));
      }

      const pad = el('div', { class: 'pad compact' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => el('button', {
          type: 'button', class: 'key' + (k === 'del' ? ' del' : ''), 'aria-label': k === 'del' ? 'מחיקה' : k,
          text: k === 'del' ? '⌫' : k, onclick: () => press(k),
        })));

      const question = opts.kind === 'debt'
        ? (meIsFrom ? `כמה אני חייב/ת ${toWord(other)}?` : `כמה ${nameOf(other)} חייב/ת לי?`)
        : (meIsFrom ? `כמה שילמתי ${toWord(other)}?`
          : isMe(st.to) ? `כמה ${nameOf(other)} שילם/ה לי?`
            : `כמה ${nameOf(st.from)} החזיר/ה ל${nameOf(st.to)}?`);

      const next = el('button', {
        type: 'button', class: 'primary', text: 'המשך', onclick: () => {
          const agorot = Math.round(parseFloat(st.amount || '0') * 100);
          if (!Number.isFinite(agorot) || agorot <= 0) { err.textContent = 'כתבו סכום גדול מאפס.'; return; }
          if (agorot > 1_000_000) { err.textContent = 'הסכום גדול מדי.'; return; }
          if (opts.maxEntry && agorot > opts.maxEntry) { err.textContent = `בין חברים אפשר לרשום עד ${money(opts.maxEntry)} בכל פעם.`; return; }
          if (maxAmount && agorot > maxAmount) { err.textContent = st.debtId ? `נשאר מהחוב הזה ${money(maxAmount)}.` : `אפשר להחזיר עד ${money(maxAmount)}.`; return; }
          st.agorot = agorot;
          stepFinal();
        },
      });

      const debtInfo = st.debtId
        ? el('div', { class: 'debt-info', text: `על: ${st.debtName} • נשאר ${money(st.debtRemaining)}` })
        : null;
      const backToDebt = st.debtId && !opts.debtId && openDebtsOf(st.from, st.to, entriesNow()).length > 1
        ? el('button', { type: 'button', class: 'ghost', text: '→ בחירת חוב אחר', onclick: () => { st.debtId = null; st.debtRemaining = null; afterPeople(); } })
        : null;
      body.replaceChildren(
        el('p', { class: 'flow-q', text: question }), debtInfo, disp, el('div', { class: 'chips' }, chips), pad, err, next, backToDebt);
      refresh();
      openOrUpdate();
    }

    function stepFinal() {
      const isDebt = opts.kind === 'debt';
      const noteInput = el('input', { type: 'text', maxlength: '80', placeholder: 'למשל: גלידה, כרטיס לסרט' });
      noteInput.value = st.note;
      noteInput.addEventListener('input', () => { st.note = noteInput.value; });
      const err = el('p', { class: 'error', role: 'alert' });

      let sentence = `${subjectWord(st.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(st.to)} ${money(st.agorot)}`;
      if (st.debtId) {
        const left = st.debtRemaining - st.agorot;
        sentence += ` על ${st.debtName}. ` + (left > 0 ? `יישאר ${money(left)} מהחוב.` : 'החוב ייסגר במלואו ✅');
      }

      const saveBtn = el('button', { type: 'button', class: 'primary', text: isDebt ? '✅ שמירת החוב' : '✅ שמירת ההחזר' });
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          await call(opts.endpoint || 'entries:add', {
            token, kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
            note: isDebt ? st.note.trim() : (st.note.trim() || 'החזר'), date: today(),
            ...(st.debtId ? { debtId: st.debtId } : {}),
          });
          closeSheet();
          toast(opts.doneToast || (!isParent() ? 'נשלח להורה לאישור ⏳' : isDebt ? 'החוב נשמר ✅' : 'ההחזר נשמר ✅'));
          switchTab(opts.returnTab || 'home');
        } catch (e) { err.textContent = errMsg(e); saveBtn.disabled = false; }
      });

      const parts = [el('div', { class: 'summary-line', text: sentence })];
      if (isDebt) {
        parts.push(
          el('p', { class: 'flow-q', text: 'על מה? (לא חובה)' }),
          el('div', { class: 'chips' }, ['🍦 גלידה', '🍬 ממתקים', '🎮 משחק', '🍕 אוכל'].map((t) => el('button', {
            type: 'button', class: 'chip', text: t, onclick: () => { noteInput.value = t; st.note = t; },
          }))),
          noteInput,
        );
      }
      parts.push(err, saveBtn, el('button', { type: 'button', class: 'ghost', text: '→ חזרה', onclick: stepAmount }));
      body.replaceChildren(...parts);
      openOrUpdate();
    }

    if (!st.from || !st.to) stepPerson(); else afterPeople();
  }

  // ---------- מסך הבית ----------
  function renderHome() {
    const me = data.me.id;
    let owe = 0, get = 0;
    const cards = [];
    for (const p of data.people) {
      if (p.id === me) continue;
      const n = pairOwes(me, p.id);
      if (n === 0) continue;
      const iOwe = n > 0;
      const amount = Math.abs(n);
      if (iOwe) owe += amount; else get += amount;
      // החובות הפתוחים בכיוון הזה, כל אחד עם מה שנשאר ממנו וכפתור החזר משלו.
      const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
      const open = openDebtsOf(dFrom, dTo);
      const lines = open.map((x) => el('div', { class: 'debt-line' },
        el('div', { class: 'dl-text' },
          el('div', { class: 'dl-name', text: debtLabel(x.debt) }),
          el('div', { class: 'dl-rem', text: x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining) })),
        el('button', {
          class: 'small', type: 'button', text: iOwe ? 'שילמתי' : 'קיבלתי',
          onclick: () => openEntryFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id }),
        })));
      cards.push(el('div', { class: 'debt ' + (iOwe ? 'owe' : 'get') + (lines.length > 1 ? ' multi' : '') },
        el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
        el('div', { class: 'text' },
          el('div', { class: 'who', text: iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי` }),
          el('div', { class: 'amt', text: money(amount) }),
          lines.length > 1 ? el('div', { class: 'debt-lines' }, lines) : null),
        el('button', {
          class: 'small strongbtn', type: 'button', text: iOwe ? '💰 שילמתי' : '💰 קיבלתי',
          onclick: () => openEntryFlow(iOwe
            ? { kind: 'payment', from: me, to: p.id, suggest: amount }
            : { kind: 'payment', from: p.id, to: me, suggest: amount }),
        })));
    }
    $('sumOwe').textContent = money(owe);
    $('sumGet').textContent = money(get);
    const box = $('myDebts');
    box.replaceChildren();
    if (data.people.length < 2) {
      box.append(el('div', { class: 'empty', text: 'עוד אין אף אחד אחר במשפחה. הורה צריך להוסיף אותם.' }));
    } else if (!cards.length) {
      box.append(el('div', { class: 'empty' }, el('div', { class: 'big-emoji', text: '🎉', 'aria-hidden': 'true' }), 'אף אחד לא חייב כלום!'));
    } else cards.forEach((c) => box.append(c));
  }

  // ---------- רשימות רשומות ----------
  const canDelete = (e) => isParent()
    || (e.createdBy === data.me.id && (isPending(e) || Date.now() - e.createdAt < UNDO_MS));

  function renderEntries(box, list, emptyText, opts = {}) {
    box.replaceChildren();
    if (!list.length) { box.append(el('div', { class: 'empty', text: emptyText })); return; }
    const debtMap = debtStates(opts.debtList || data.entries);
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).forEach((e) => {
      const isDebt = e.kind === 'debt';
      const title = `${subjectWord(e.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(e.to)}`;
      // חוב: כמה נשאר ממנו. החזר: על איזה חוב הוא.
      let extra = '';
      const ds = e.debtId || isDebt ? debtMap : null;
      if (ds && isDebt && !isPending(e) && ds.get(e.id) && ds.get(e.id).paid > 0) {
        const st = ds.get(e.id);
        extra = st.remaining > 0 ? `נשאר ${money(st.remaining)} מתוך ${money(e.amount)}` : 'שולם במלואו ✅';
      } else if (ds && !isDebt && e.debtId && ds.get(e.debtId)) {
        extra = 'על: ' + (ds.get(e.debtId).debt.note || 'חוב');
      }
      const row = el('div', { class: 'row' + (isPending(e) ? ' pending' : '') },
        el('div', { class: 'text' },
          el('div', {}, el('span', { class: 'tag ' + e.kind, text: isDebt ? 'חוב' : 'החזר' }),
            isPending(e) ? el('span', { class: 'tag pending', text: opts.pendingLabel ? opts.pendingLabel(e) : '⏳ ממתין לאישור' }) : null, ' ', title),
          el('div', { class: 'meta', text: [fmtDate(e.date), e.note, extra].filter(Boolean).join(' • ') })),
        el('strong', { text: money(e.amount) }));
      if (canDelete(e)) {
        row.append(el('button', {
          class: 'small danger', type: 'button', text: isParent() ? 'מחיקה' : 'ביטול',
          onclick: async () => {
            if (!confirm(isParent() ? 'למחוק את הרשומה הזאת?' : 'לבטל את מה שרשמת?')) return;
            try { await call(opts.removeEndpoint || 'entries:remove', { token, id: e.id }); toast('הרשומה נמחקה'); }
            catch (err) { toast(errMsg(err)); }
          },
        }));
      }
      box.append(row);
    });
  }

  // ---------- ממתין לאישור ----------
  const friendRequests = () => (isParent() ? data.people.filter((p) => p.friendsRequested) : []);
  const teenRequests = () => (isParent() ? data.people.filter((p) => p.teenRequested) : []);
  const parentPendingCount = () => data.entries.filter(isPending).length + friendRequests().length + teenRequests().length;

  function renderPending() {
    const parentView = isParent();
    // להורים האישורים בראש הסקירה המשפחתית. לאחרים, בדף הבית.
    const box = parentView ? $('pendingBoxParent') : $('pendingBox');
    (parentView ? $('pendingBox') : $('pendingBoxParent')).replaceChildren();
    box.replaceChildren();
    const list = data.entries.filter(isPending);
    if (!parentView) {
      if (!list.length) return;
      box.append(el('div', { class: 'card notice' },
        el('p', { text: `⏳ ${list.length === 1 ? 'רישום אחד מחכה' : list.length + ' רישומים מחכים'} לאישור של הורה. אפשר לראות אותם ב"מה היה".` })));
      return;
    }

    const teenReqs = teenRequests();
    if (teenReqs.length) {
      const tcard = el('div', { class: 'card pending-card' }, el('h3', { text: `🎧 בקשות לעבור לנוער (${teenReqs.length})` }));
      teenReqs.forEach((p) => tcard.append(el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', { text: `${p.name} מבקש/ת להפוך לנער/ה` }),
          el('div', { class: 'meta', text: 'ממשק מותאם לנוער. מצב חברים נפרד ודורש אישור נוסף.' })),
        el('div', { class: 'acts' },
          el('button', {
            class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
              try { await call('people:setRole', { token, id: p.id, role: 'teen' }); toast(`${p.name} עכשיו נער/ה`); }
              catch (err) { toast(errMsg(err)); }
            },
          }),
          el('button', {
            class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
              try { await call('people:declineTeen', { token, id: p.id }); toast('הבקשה נדחתה'); }
              catch (err) { toast(errMsg(err)); }
            },
          })))));
      box.append(tcard);
    }

    const reqs = friendRequests();
    if (reqs.length) {
      const card = el('div', { class: 'card pending-card' }, el('h3', { text: `🤝 בקשות למצב חברים (${reqs.length})` }));
      reqs.forEach((p) => card.append(el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', { text: `${p.name} מבקש/ת לרשום חובות עם חברים` }),
          el('div', { class: 'meta', text: 'חברים נוספים לפי כתובת מייל. תראו כל מה שנרשם בסקירה.' })),
        el('div', { class: 'acts' },
          el('button', { class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: () => openFriendApprove(p) }),
          el('button', {
            class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
              try { await call('friends:declineAccess', { token, personId: p.id }); toast('הבקשה נדחתה'); }
              catch (err) { toast(errMsg(err)); }
            },
          })))));
      box.append(card);
    }

    if (!list.length) return;
    const card = el('div', { class: 'card pending-card' }, el('h3', { text: `⏳ ממתין לאישור (${list.length})` }));
    [...list].sort((x, y) => x.createdAt - y.createdAt).forEach((e) => {
      const isDebt = e.kind === 'debt';
      const who = e.createdBy ? nameOf(e.createdBy) : 'מישהו';
      card.append(el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', { text: `${who} רשם/ה: ${nameOf(e.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ל${nameOf(e.to)}` }),
          el('div', { class: 'meta', text: [money(e.amount), fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
        el('div', { class: 'acts' },
          el('button', {
            class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
              try { await call('entries:approve', { token, id: e.id }); toast('אושר ✅'); }
              catch (err) { toast(errMsg(err)); }
            },
          }),
          el('button', {
            class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
              if (!confirm('לדחות? הרישום יימחק.')) return;
              try { await call('entries:reject', { token, id: e.id }); toast('הרישום נדחה'); }
              catch (err) { toast(errMsg(err)); }
            },
          }))));
    });
    box.append(card);
  }

  // הורה מאשר מצב חברים לנער/ה וקובע את המייל שדרכו חברים יוסיפו אותו/ה.
  function openFriendApprove(p) {
    const email = el('input', { type: 'email', dir: 'ltr', autocomplete: 'off', placeholder: 'name@example.com', maxlength: '254' });
    email.value = p.friendEmail || '';
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('מצב חברים ל' + p.name, el('div', { class: 'form' },
      el('p', { class: 'hint', text: `${p.name} יוכל/תוכל להוסיף חברים לפי מייל ולרשום איתם חובות. כל רישום ממתין גם לאישור של החבר/ה, ואתם רואים אותם בסקירה. אפשר לכבות בכל רגע.` }),
      el('label', { class: 'field' }, el('span', { text: `המייל של ${p.name}` }), email),
      el('p', { class: 'hint', text: 'חברים מוסיפים את הנער/ה לפי המייל הזה. לא נשלח אליו שום דבר, הוא משמש רק לחיפוש.' }),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'אישור מצב חברים', onclick: async () => {
          try {
            await call('friends:approveAccess', { token, personId: p.id, email: email.value });
            closeSheet();
            toast('מצב חברים אושר ✅');
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  }

  // ---------- התראות (Push) ----------
  const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const pushSupported = () => !!window.VAPID_PUBLIC_KEY && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;

  function keyToBytes(b64) {
    const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  const getPushSub = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

  async function sendSubToServer(sub) {
    const j = sub.toJSON();
    await call('push:subscribe', { token, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  }

  async function renderPushBtn() {
    const btn = $('pushBtn');
    if (!pushSupported()) { btn.hidden = true; return; }
    btn.hidden = false;
    let on = false;
    try { on = Notification.permission === 'granted' && !!(await getPushSub()); } catch (e) { /* ignore */ }
    btn.textContent = on ? '🔕 כיבוי התראות' : '🔔 הפעלת התראות';
    btn.dataset.on = on ? '1' : '';
  }

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('ההתראות חסומות. אפשר לאשר אותן בהגדרות הדפדפן.'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(window.VAPID_PUBLIC_KEY) });
      await sendSubToServer(sub);
      toast('ההתראות הופעלו 🔔');
    } catch (e) { toast(e && e.data ? errMsg(e) : 'לא הצלחנו להפעיל התראות במכשיר הזה'); }
    renderPushBtn();
  }

  async function disablePush() {
    try {
      const sub = await getPushSub();
      if (sub) {
        try { await call('push:unsubscribe', { token, endpoint: sub.endpoint }); } catch (e) { /* ignore */ }
        await sub.unsubscribe();
      }
      toast('ההתראות כובו');
    } catch (e) { toast('משהו השתבש. נסו שוב.'); }
    renderPushBtn();
  }

  $('pushBtn').addEventListener('click', () => ($('pushBtn').dataset.on ? disablePush() : enablePush()));

  // בכל כניסה מחדשים את הרישום של המכשיר על שם מי שמחובר עכשיו (חשוב במכשיר משותף).
  let pushSyncedFor = '';
  async function syncPush() {
    if (pushSyncedFor === token) return;
    pushSyncedFor = token;
    if (!pushSupported() || Notification.permission !== 'granted') return;
    try { const sub = await getPushSub(); if (sub) await sendSubToServer(sub); } catch (e) { /* ignore */ }
  }

  async function releasePushDevice() {
    if (!pushSupported()) return;
    try {
      // מסירים את המכשיר מהמשתמש הנוכחי בשרת. ההרשאה בדפדפן נשארת, והכניסה הבאה תרשום אותו מחדש.
      const sub = await getPushSub();
      if (sub) await call('push:unsubscribe', { token, endpoint: sub.endpoint });
    } catch (e) { /* ignore */ }
  }

  // ---------- דמי כיס קבועים (הורים) ----------
  const recurringWhen = (r) => (r.frequency === 'weekly' ? `כל יום ${WEEKDAYS[r.weekday]}` : `ב-${r.monthDay} בכל חודש`);

  function renderRecurring() {
    const box = $('recurringList');
    box.replaceChildren();
    if (!data.recurring.length) box.append(el('div', { class: 'empty', text: 'עוד אין רישומים קבועים.' }));
    data.recurring.forEach((r) => box.append(el('div', { class: 'row' },
      el('div', { class: 'text' },
        el('div', { text: `${nameOf(r.from)} חייב/ת ל${nameOf(r.to)} ${money(r.amount)}` }),
        el('div', { class: 'meta', text: [recurringWhen(r), r.note, 'הרישום הבא: ' + fmtDate(r.nextDate)].filter(Boolean).join(' • ') })),
      el('button', {
        class: 'small danger', type: 'button', text: 'הפסקה', onclick: async () => {
          if (!confirm('להפסיק את הרישום הקבוע? מה שכבר נרשם נשאר.')) return;
          try { await call('recurring:remove', { token, id: r.id }); toast('הרישום הקבוע הופסק'); }
          catch (err) { toast(errMsg(err)); }
        },
      }))));

    // רשימות הבחירה של הטופס. שומרים על הבחירה הקיימת בין רענונים.
    const fill = (sel, items, fallback) => {
      const prev = sel.value;
      sel.replaceChildren(...items.map(([val, label]) => el('option', { value: val, text: label })));
      sel.value = items.some(([val]) => val === prev) ? prev : fallback;
    };
    const people = data.people.map((p) => [p.id, `${p.avatar} ${p.name}`]);
    const firstChild = data.people.find((p) => p.role === 'child');
    fill($('recFrom'), people, data.me.id);
    fill($('recTo'), people, firstChild ? firstChild.id : (data.people.find((p) => p.id !== data.me.id) || data.me).id);
    if (!$('recWeekday').childElementCount) {
      fill($('recWeekday'), WEEKDAYS.map((d, i) => [String(i), 'יום ' + d]), '5');
      fill($('recMonthDay'), Array.from({ length: 28 }, (_, i) => [String(i + 1), String(i + 1)]), '1');
    }
  }

  $('recFreq').addEventListener('change', () => {
    const weekly = $('recFreq').value === 'weekly';
    $('recWeekdayField').hidden = !weekly;
    $('recMonthDayField').hidden = weekly;
  });

  $('recurringForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('recError');
    err.hidden = true;
    const agorot = Math.round(parseFloat($('recAmount').value) * 100);
    if (!Number.isFinite(agorot) || agorot <= 0) { err.textContent = 'כתבו סכום גדול מאפס.'; err.hidden = false; return; }
    const freq = $('recFreq').value;
    try {
      await call('recurring:add', {
        token, from: $('recFrom').value, to: $('recTo').value, amount: agorot, note: $('recNote').value,
        frequency: freq,
        weekday: freq === 'weekly' ? Number($('recWeekday').value) : undefined,
        monthDay: freq === 'monthly' ? Number($('recMonthDay').value) : undefined,
      });
      $('recAmount').value = '';
      toast('הרישום הקבוע נוסף ✅');
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
  });

  // ---------- לשונית המשפחה (הורים) ----------
  function renderFamily() {
    const bal = new Map(data.people.map((p) => [p.id, 0]));
    const debts = openDebts();
    debts.forEach((d) => {
      bal.set(d.creditor, bal.get(d.creditor) + d.amount);
      bal.set(d.debtor, bal.get(d.debtor) - d.amount);
    });
    $('balances').replaceChildren(...data.people.map((p) => {
      const v = bal.get(p.id) || 0;
      return el('div', { class: 'bal ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero') },
        el('div', { class: 'name', text: `${p.avatar} ${p.name}` }),
        el('div', { class: 'num', text: money(Math.abs(v)) }),
        el('div', { class: 'what', text: v > 0 ? 'מגיע לו/ה' : v < 0 ? 'חייב/ת' : 'הכול מסודר' }));
    }));

    const dbox = $('debts');
    dbox.replaceChildren();
    if (!debts.length) dbox.append(el('div', { class: 'empty', text: 'אף אחד לא חייב כלום.' }));
    debts.forEach((d) => dbox.append(el('div', { class: 'debt' },
      el('div', { class: 'text' },
        el('div', { class: 'who', text: `${nameOf(d.debtor)} חייב/ת ל${nameOf(d.creditor)}` }),
        el('div', { class: 'amt', text: money(d.amount) })),
      el('button', {
        class: 'small', type: 'button', text: 'החזר חלקי',
        onclick: () => openEntryFlow({ kind: 'payment', from: d.debtor, to: d.creditor, suggest: d.amount }),
      }),
      el('button', {
        class: 'small', type: 'button', text: 'שולם הכול', onclick: async () => {
          if (!confirm(`${nameOf(d.debtor)} סגר/ה את כל החוב (${money(d.amount)})?`)) return;
          try {
            await call('entries:add', { token, kind: 'payment', from: d.debtor, to: d.creditor, amount: d.amount, note: 'סגירת חוב', date: today() });
            toast('החוב נסגר ✅');
          } catch (e) { toast(errMsg(e)); }
        },
      }))));

    $('peopleList').replaceChildren(...data.people.map((p) => el('div', { class: 'person' },
      el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
      el('div', { class: 'text' }, p.name, ' ',
        el('span', { class: 'meta', text: roleLabel(p.role) + (p.hasPin ? '' : ' • עוד לא בחר/ה קוד') }),
        p.lockAlert ? el('div', { class: 'meta', style: 'color:#b45309', text: `⚠️ הקוד של ${p.name} ננעל ${p.lockAlert.count === 1 ? 'פעם אחת' : p.lockAlert.count + ' פעמים'} אחרי ניסיונות שגויים. אם זה לא הוא/היא, כדאי לקבוע קוד חדש.` }) : null,
        p.role === 'teen' && p.friendsEnabled ? el('div', { class: 'meta', text: `🤝 מצב חברים פעיל • ${p.friendEmail || ''}` }) : null),
      el('button', { class: 'small', type: 'button', text: 'קוד חדש', onclick: () => openResetPin(p) }),
      p.role === 'parent' ? null : el('button', {
        class: 'small', type: 'button', text: p.role === 'teen' ? 'חזרה לילד/ה' : 'הפיכה לנער/ה',
        onclick: async () => {
          const toRole = p.role === 'teen' ? 'child' : 'teen';
          if (toRole === 'child' && p.friendsEnabled && !confirm(`${p.name} יאבד/תאבד את מצב החברים. להמשיך?`)) return;
          try { await call('people:setRole', { token, id: p.id, role: toRole }); toast(toRole === 'teen' ? `${p.name} עכשיו נער/ה` : `${p.name} עכשיו ילד/ה`); }
          catch (e) { toast(errMsg(e)); }
        },
      }),
      p.role === 'teen' && p.friendsEnabled ? el('button', {
        class: 'small danger', type: 'button', text: 'כיבוי חברים',
        onclick: async () => {
          if (!confirm(`לכבות את מצב החברים של ${p.name}? אי אפשר יהיה להוסיף רישומים חדשים עם חברים.`)) return;
          try { await call('friends:disableAccess', { token, personId: p.id }); toast('מצב חברים כובה'); }
          catch (e) { toast(errMsg(e)); }
        },
      }) : null,

      p.id === data.me.id ? null : el('button', {
        class: 'small danger', type: 'button', text: 'הסרה', 'aria-label': 'הסרת ' + p.name,
        onclick: async () => {
          if (!confirm(`להסיר את ${p.name} מהמשפחה?`)) return;
          try { await call('people:remove', { token, id: p.id }); toast(`${p.name} הוסר/ה`); }
          catch (e) { toast(errMsg(e)); }
        },
      }))));

    renderEntries($('allHistory'), data.entries, 'עדיין אין רשומות.');
    renderTeenOverview();
    renderRecurring();
    renderCodes();
    renderLegacy();
  }

  // ---------- סקירה להורים: מה הנוער רושם עם חברים ----------
  function renderTeenOverview() {
    const teens = fdata && fdata.kind === 'parent' ? fdata.teens : [];
    $('teenFriendsSection').hidden = teens.length === 0;
    $('teenFriendsBox').replaceChildren(...teens.map((t) => el('div', { class: 'card teen-card' },
      el('h3', { text: `🤝 ${t.name}` }),
      el('div', { class: 'meta', text: t.friends.length ? 'חברים: ' + t.friends.join(', ') : 'עוד אין חברים מאושרים' }),
      ...(t.entries.length ? t.entries.map((e) => el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', {},
            el('span', { class: 'tag ' + e.kind, text: e.kind === 'debt' ? 'חוב' : 'החזר' }),
            e.status === 'pending' ? el('span', { class: 'tag pending', text: '⏳ ממתין לחבר/ה' }) : null,
            ' ', `${e.fromName} ${e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ל${e.toName}`),
          el('div', { class: 'meta', text: [fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
        el('strong', { text: money(e.amount) })))
        : [el('div', { class: 'empty', text: 'עוד לא נרשם כלום.' })]))));
  }

  // ---------- מצב חברים (בני נוער) ----------
  const FRIEND_MAX = 50000; // באגורות, כמו בשרת
  const friendList = () => (fdata && fdata.kind === 'teen' && fdata.enabled
    ? fdata.friendships.filter((f) => f.status === 'accepted').map((f) => fdata.people[f.other]).filter(Boolean)
    : []);
  const friendFlow = (opts) => ({
    ...opts, entries: () => fdata.entries, people: friendList(), endpoint: 'friends:addEntry', maxEntry: FRIEND_MAX,
    doneToast: 'נשלח לחבר/ה לאישור ⏳', returnTab: 'friends',
  });
  const friendsInboxCount = () => (fdata && fdata.kind === 'teen' && fdata.enabled
    ? fdata.friendships.filter((f) => f.status === 'pending' && f.incoming).length
      + fdata.entries.filter((e) => isPending(e) && e.createdBy !== data.me.id).length
    : 0);

  function startFriendFlow(opts) {
    if (!friendList().length) { toast('עוד אין חברים מאושרים. הוסיפו חבר/ה לפי המייל שלהם.'); return; }
    openEntryFlow(friendFlow(opts));
  }

  async function removeFriendship(f, p) {
    if (!confirm(`להסיר את ${p.name} מהחברים?`)) return;
    try { await call('friends:removeFriend', { token, friendshipId: f.id }); toast('החבר/ה הוסרו'); }
    catch (e) { toast(errMsg(e)); }
  }

  function renderFriends() {
    const locked = $('friendsLocked'), on = $('friendsOn');
    if (!fdata || fdata.kind !== 'teen') { locked.hidden = true; on.hidden = true; return; }
    if (!fdata.enabled) {
      locked.hidden = false; on.hidden = true;
      $('friendsRequestBtn').hidden = fdata.requested;
      $('friendsLockNote').textContent = fdata.requested ? '⏳ הבקשה נשלחה להורים. נעדכן אותך כשיאשרו.' : '';
      return;
    }
    locked.hidden = true; on.hidden = false;
    const me = data.me.id;
    const entries = fdata.entries;
    let owe = 0, get = 0;
    const cards = [];
    for (const f of fdata.friendships) {
      const p = fdata.people[f.other];
      if (!p) continue;
      if (f.status !== 'accepted') {
        if (f.incoming) continue; // בקשות נכנסות מוצגות בתיבה למעלה
        cards.push(el('div', { class: 'debt' },
          el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
          el('div', { class: 'text' },
            el('div', { class: 'who', text: p.name }),
            el('div', { class: 'meta', text: '⏳ ממתין שיאשרו את הבקשה' })),
          el('button', { class: 'small', type: 'button', text: 'ביטול', onclick: () => removeFriendship(f, p) })));
        continue;
      }
      const n = pairOwes(me, p.id, entries);
      const iOwe = n > 0;
      const amount = Math.abs(n);
      if (n > 0) owe += amount; else if (n < 0) get += amount;
      // החובות הפתוחים בכיוון הזה, כל אחד עם מה שנשאר ממנו וכפתור החזר משלו.
      const [dFrom, dTo] = iOwe ? [me, p.id] : [p.id, me];
      const open = n === 0 ? [] : openDebtsOf(dFrom, dTo, entries);
      const lines = open.map((x) => el('div', { class: 'debt-line' },
        el('div', { class: 'dl-text' },
          el('div', { class: 'dl-name', text: debtLabel(x.debt) }),
          el('div', { class: 'dl-rem', text: x.paid > 0 ? `נשאר ${money(x.remaining)} מתוך ${money(x.debt.amount)}` : money(x.remaining) })),
        el('button', {
          class: 'small', type: 'button', text: iOwe ? 'שילמתי' : 'קיבלתי',
          onclick: () => openEntryFlow(friendFlow({ kind: 'payment', from: dFrom, to: dTo, debtId: x.debt.id })),
        })));
      cards.push(el('div', { class: 'debt' + (n === 0 ? '' : iOwe ? ' owe' : ' get') + (lines.length > 1 ? ' multi' : '') },
        el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
        el('div', { class: 'text' },
          el('div', { class: 'who', text: n === 0 ? p.name : iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי` }),
          el('div', { class: 'amt', text: n === 0 ? 'הכול מסודר ✅' : money(amount) }),
          lines.length > 1 ? el('div', { class: 'debt-lines' }, lines) : null),
        n === 0 ? null : el('button', {
          class: 'small strongbtn', type: 'button', text: iOwe ? '💰 שילמתי' : '💰 קיבלתי',
          onclick: () => openEntryFlow(friendFlow(iOwe
            ? { kind: 'payment', from: me, to: p.id, suggest: amount }
            : { kind: 'payment', from: p.id, to: me, suggest: amount })),
        }),
        el('button', { class: 'small danger', type: 'button', text: 'הסרה', 'aria-label': 'הסרת ' + p.name, onclick: () => removeFriendship(f, p) })));
    }
    $('fSumOwe').textContent = money(owe);
    $('fSumGet').textContent = money(get);
    const list = $('friendsList');
    list.replaceChildren();
    if (!cards.length) list.append(el('div', { class: 'empty' }, el('div', { class: 'big-emoji', text: '🤝', 'aria-hidden': 'true' }), 'עוד אין חברים. הוסיפו חבר/ה לפי המייל שלהם.'));
    else cards.forEach((c) => list.append(c));

    // תיבת נכנס: בקשות חברות, ורישומים שחבר/ה רשמו וממתינים לאישור שלך.
    const inbox = [];
    const incoming = fdata.friendships.filter((f) => f.status === 'pending' && f.incoming);
    if (incoming.length) {
      inbox.push(el('div', { class: 'card pending-card' }, el('h3', { text: `🤝 בקשות חברות (${incoming.length})` }),
        incoming.map((f) => {
          const p = fdata.people[f.other];
          return el('div', { class: 'row' },
            el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p ? p.avatar : '🙂' }),
            el('div', { class: 'text', text: `${p ? p.name : 'מישהו'} רוצה להוסיף אותך` }),
            el('div', { class: 'acts' },
              el('button', {
                class: 'small okbtn', type: 'button', text: '✅ אישור', onclick: async () => {
                  try { await call('friends:respondFriend', { token, friendshipId: f.id, accept: true }); toast('חבר/ה נוספו ✅'); }
                  catch (err) { toast(errMsg(err)); }
                },
              }),
              el('button', {
                class: 'small danger', type: 'button', text: 'דחייה', onclick: async () => {
                  try { await call('friends:respondFriend', { token, friendshipId: f.id, accept: false }); toast('הבקשה נדחתה'); }
                  catch (err) { toast(errMsg(err)); }
                },
              })));
        })));
    }
    const waiting = entries.filter((e) => isPending(e) && e.createdBy !== me);
    if (waiting.length) {
      inbox.push(el('div', { class: 'card pending-card' }, el('h3', { text: `⏳ ממתין לאישור שלך (${waiting.length})` }),
        [...waiting].sort((x, y) => x.createdAt - y.createdAt).map((e) => el('div', { class: 'row' },
          el('div', { class: 'text' },
            el('div', { text: `${nameOf(e.createdBy)} רשם/ה: ${subjectWord(e.from)} ${e.kind === 'debt' ? 'חייב/ת' : 'החזיר/ה'} ${toWord(e.to)}` }),
            el('div', { class: 'meta', text: [money(e.amount), fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
          el('div', { class: 'acts' },
            el('button', {
              class: 'small okbtn', type: 'button', text: '✅ נכון', onclick: async () => {
                try { await call('friends:confirmEntry', { token, id: e.id }); toast('אושר ✅'); }
                catch (err) { toast(errMsg(err)); }
              },
            }),
            el('button', {
              class: 'small danger', type: 'button', text: 'לא נכון', onclick: async () => {
                if (!confirm('לדחות? הרישום יימחק.')) return;
                try { await call('friends:rejectEntry', { token, id: e.id }); toast('הרישום נדחה'); }
                catch (err) { toast(errMsg(err)); }
              },
            }))))));
    }
    $('friendsInbox').replaceChildren(...inbox);

    $('myFriendEmail').textContent = fdata.email || '';
    renderEntries($('friendHistory'), entries, 'עוד לא נרשם כלום עם חברים.', {
      removeEndpoint: 'friends:removeEntry',
      debtList: entries,
      pendingLabel: (e) => (e.createdBy === me ? '⏳ ממתין לחבר/ה' : '⏳ ממתין לאישור שלך'),
    });
  }

  $('friendsRequestBtn').addEventListener('click', withBusy($('friendsRequestBtn'), async () => {
    try { await call('friends:requestAccess', { token }); toast('הבקשה נשלחה להורים ⏳'); }
    catch (e) { toast(errMsg(e)); }
  }));
  $('teenRequestBtn').addEventListener('click', withBusy($('teenRequestBtn'), async () => {
    try { await call('people:requestTeen', { token }); toast('הבקשה נשלחה להורים ⏳'); }
    catch (e) { toast(errMsg(e)); }
  }));
  $('btnFriendIOwe').addEventListener('click', () => startFriendFlow({ kind: 'debt', from: data.me.id }));
  $('btnFriendOwesMe').addEventListener('click', () => startFriendFlow({ kind: 'debt', to: data.me.id }));
  $('friendForm').addEventListener('submit', withBusy($('friendForm').querySelector('button[type=submit]'), async (ev) => {
    ev.preventDefault();
    const err = $('friendError');
    err.hidden = true;
    try {
      await call('friends:addFriend', { token, email: $('friendEmailInput').value });
      $('friendEmailInput').value = '';
      toast('אם לחבר/ה יש מצב חברים, נשלחה להם בקשה 🤝');
    } catch (e) { err.textContent = errMsg(e); err.hidden = false; }
  }));

  // ---------- קודי הצטרפות ----------
  async function shareCode(title, code) {
    const text = `${title} לקופה של ${data.family.name}: ${prettyCode(code)}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('הועתק ✅');
    } catch (e) { /* בוטל */ }
  }

  function renderCodes() {
    const f = data.family;
    const block = (label, hint, code, which, shareTitle) => el('div', { class: 'codeblock' },
      el('div', { class: 'meta', text: label }),
      el('div', { class: 'codeval', dir: 'ltr', text: prettyCode(code) }),
      el('p', { class: 'hint', text: hint }),
      el('div', { class: 'tools' },
        el('button', { class: 'small', type: 'button', text: 'שיתוף', onclick: () => shareCode(shareTitle, code) }),
        el('button', {
          class: 'small', type: 'button', text: 'החלפת קוד', onclick: async () => {
            if (!confirm('להחליף את הקוד? מי שכבר בפנים נשאר, אבל הקוד הישן יפסיק לעבוד.')) return;
            try { await call('family:rotateCode', { token, which }); toast('הקוד הוחלף ✅'); }
            catch (e) { toast(errMsg(e)); }
          },
        })));
    $('codesBox').replaceChildren(el('div', { class: 'card codes' },
      el('h3', { text: '🔑 קודי הצטרפות' }),
      block('קוד לילדים', 'ילדים שמקלידים אותו מצטרפים בתור ילדים.', f.childCode, 'child', 'קוד ילדים'),
      block('קוד להורים', 'להורה השני. מי שמקליד אותו מצטרף בתור הורה, אז לא לשתף עם ילדים.', f.parentCode, 'parent', 'קוד הורים')));
  }

  function openResetPin(p) {
    const emailRequired = !!data.me.email;
    const build = () => {
      const input = pinField('new-password');
      const codeIn = emailRequired ? codeField() : null;
      const err = el('p', { class: 'error', role: 'alert' });
      const run = async (pin) => {
        try {
          const res = await call('auth:resetPin', { token, personId: p.id, pin, emailCode: codeIn ? codeIn.value : undefined });
          if (res && res.ok === false) { err.textContent = 'קוד האימות מהמייל שגוי או שפג תוקפו.'; return; }
          closeSheet();
          toast(pin ? `הקוד של ${p.name} עודכן` : `${p.name} יבחר/תבחר קוד חדש בכניסה הבאה`);
        } catch (e) { err.textContent = errMsg(e); }
      };
      openSheet('קוד סודי ל' + p.name, el('div', { class: 'form' },
        codeIn ? el('label', { class: 'field' }, el('span', { text: 'קוד אימות מהמייל' }), codeIn) : null,
        el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), input),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'קביעת הקוד', onclick: () => {
            if (!/^\d{4}$/.test(input.value)) { err.textContent = 'הקוד צריך להיות 4 ספרות.'; return; }
            run(input.value);
          },
        }),
        el('button', { class: 'ghost', type: 'button', text: 'לאפס, ושיבחרו לבד בכניסה הבאה', onclick: () => run(undefined) })));
    };
    if (!emailRequired) { build(); return; }
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('אישור במייל', el('div', { class: 'form' },
      el('p', { class: 'hint', text: `כדי לקבוע קוד חדש ל${p.name} נשלח קוד אימות ל-${data.me.email}.` }),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
          try { await call('emailAuth:requestChildResetCode', { token }); build(); }
          catch (e) { err.textContent = errMsg(e); }
        },
      })));
  }

  // ---------- אימות במייל ----------
  const codeField = () => el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '6 ספרות', dir: 'ltr' });
  const pinField = (ac) => el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: ac });

  // הוספה או החלפה של מייל להורה: כתובת, ואז קוד אימות שנשלח אליה.
  function openEmailSheet() {
    const current = data.me.email;
    const stepCode = (addr) => {
      const code = codeField();
      const err = el('p', { class: 'error', role: 'alert' });
      openSheet('אימות המייל', el('div', { class: 'form' },
        el('p', { class: 'hint', text: `שלחנו קוד בן 6 ספרות אל ${addr}. הוא תקף ל-10 דקות.` }),
        el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), code),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'אימות', onclick: async () => {
            try {
              const res = await call('emailAuth:confirmEmail', { token, code: code.value });
              if (res.ok) { closeSheet(); toast('המייל אומת ✅'); }
              else err.textContent = 'הקוד שגוי או שפג תוקפו.';
            } catch (e) { err.textContent = errMsg(e); }
          },
        }),
        el('button', { class: 'ghost', type: 'button', text: 'כתובת אחרת', onclick: start })));
    };
    // כתובת חדשה. אם כבר יש מייל מאומת, צריך גם את הקוד שנשלח למייל הישן.
    const stepEmail = () => {
      const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'name@example.com', dir: 'ltr' });
      const oldCode = current ? codeField() : null;
      const err = el('p', { class: 'error', role: 'alert' });
      openSheet('מייל לשחזור הקוד', el('div', { class: 'form' },
        el('p', { class: 'hint', text: current
          ? `שלחנו קוד אל ${current}. כתבו אותו, ואת הכתובת החדשה. היא תחליף את הנוכחית רק אחרי אימות.`
          : 'נשלח אליו קוד כשמשנים או מאפסים קוד סודי, וגם התראה כשהקוד של מישהו במשפחה ננעל.' }),
        oldCode ? el('label', { class: 'field' }, el('span', { text: 'קוד מהמייל הנוכחי' }), oldCode) : null,
        el('label', { class: 'field' }, el('span', { text: 'כתובת מייל' + (current ? ' חדשה' : '') }), email),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'שליחת קוד אימות', onclick: async () => {
            err.textContent = '';
            try {
              const res = await call('emailAuth:requestVerify', { token, email: email.value, oldCode: oldCode ? oldCode.value : undefined });
              if (res.ok) stepCode(email.value.trim().toLowerCase());
              else err.textContent = 'הקוד מהמייל הנוכחי שגוי או שפג תוקפו.';
            } catch (e) { err.textContent = errMsg(e); }
          },
        })));
    };
    // נקודת ההתחלה: בלי מייל, ישר לכתובת. עם מייל מאומת, קודם שולחים קוד למייל הישן.
    function start() {
      if (!current) { stepEmail(); return; }
      const err = el('p', { class: 'error', role: 'alert' });
      openSheet('החלפת מייל', el('div', { class: 'form' },
        el('p', { class: 'hint', text: `המייל הנוכחי: ${current}. להחלפה נשלח אליו קוד אישור.` }),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'שליחת קוד למייל הנוכחי', onclick: async () => {
            try { await call('emailAuth:requestEmailChangeCode', { token }); stepEmail(); }
            catch (e) { err.textContent = errMsg(e); }
          },
        })));
    }
    start();
  }

  // שינוי הקוד הסודי של הורה עם מייל מאומת: קוד מהמייל במקום הקוד הנוכחי.
  function openChangePinEmail() {
    const stepForm = () => {
      const code = codeField();
      const newPin = pinField('new-password');
      const err = el('p', { class: 'error', role: 'alert' });
      openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
        el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), code),
        el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'שמירה', onclick: async () => {
            if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
            try {
              const res = await call('emailAuth:changePinWithCode', { token, code: code.value, newPin: newPin.value });
              if (res.ok) { closeSheet(); toast('הקוד שונה ✅'); }
              else err.textContent = 'קוד האימות שגוי או שפג תוקפו.';
            } catch (e) { err.textContent = errMsg(e); }
          },
        })));
    };
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
      el('p', { class: 'hint', text: `לאישור נשלח קוד אימות ל-${data.me.email}.` }),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
          try { await call('emailAuth:requestChangeCode', { token }); stepForm(); }
          catch (e) { err.textContent = errMsg(e); }
        },
      })));
  }

  // שכחתי קוד (הורה, במסך הכניסה): קוד למייל המאומת, ואז בוחרים קוד חדש ונכנסים.
  function openForgotPin() {
    const f = pinFlow;
    if (!f || f.legacy) return;
    const stepReset = () => {
      const emailCode = codeField();
      const newPin = pinField('new-password');
      const err = el('p', { class: 'error', role: 'alert' });
      openSheet('קוד סודי חדש', el('div', { class: 'form' },
        el('label', { class: 'field' }, el('span', { text: 'הקוד מהמייל' }), emailCode),
        el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
        err,
        el('button', {
          class: 'primary', type: 'button', text: 'קביעת הקוד והכניסה', onclick: async () => {
            if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
            try {
              const res = await call('emailAuth:resetWithCode', { code: fam.code, personId: f.person.id, emailCode: emailCode.value, newPin: newPin.value });
              if (res.ok) { pinFlow = null; setToken(res.token); return; }
              if (res.reason === 'code') { closeSheet(); codeGone(); return; }
              err.textContent = res.reason === 'throttled' ? 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.' : 'קוד האימות שגוי או שפג תוקפו.';
            } catch (e) { err.textContent = errMsg(e); }
          },
        })));
    };
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('שכחתי את הקוד', el('div', { class: 'form' },
      el('p', { class: 'hint', text: 'אם הוגדר מייל מאומת להורה הזה, נשלח אליו קוד אימות. אם לא הוגדר מייל, הורה אחר יכול לקבוע לך קוד חדש.' }),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שליחת קוד למייל', onclick: async () => {
          try {
            const res = await call('emailAuth:requestResetCode', { code: fam.code, personId: f.person.id });
            if (res.ok) { stepReset(); return; }
            if (res.reason === 'code') { closeSheet(); codeGone(); return; }
            err.textContent = 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  }
  $('forgotPinBtn').addEventListener('click', openForgotPin);
  $('emailBtn').addEventListener('click', openEmailSheet);

  // ---------- נתונים ישנים מהמכשיר ----------
  function readLegacy() {
    if (localStorage.getItem(LEGACY_DONE_KEY)) return null;
    try {
      const s = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (s && Array.isArray(s.people) && Array.isArray(s.entries) && (s.people.length || s.entries.length)) return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  function cleanPayload(s) {
    return {
      people: s.people.map((p) => ({ id: String(p.id), name: String(p.name), role: p.role === 'parent' ? 'parent' : 'child' })),
      entries: s.entries.map((e) => ({
        kind: e.kind === 'payment' ? 'payment' : 'debt', from: String(e.from), to: String(e.to),
        amount: Number(e.amount), note: e.note ? String(e.note) : undefined, date: String(e.date),
      })),
    };
  }

  function renderLegacy() {
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
            const res = await call('admin:importData', { token, ...cleanPayload(s) });
            localStorage.setItem(LEGACY_DONE_KEY, '1');
            toast(`הועברו ${res.added} רשומות`);
            renderLegacy();
          } catch (e) { toast(errMsg(e)); }
        },
      })));
  }

  // ---------- ערכות נושא ותוויות ----------
  const THEME_COLOR = { parent: '#1f2933', child: '#1d2b4f', teen: '#2a1b6e' };
  const TAB_LABELS = {
    parent: { family: 'סקירה משפחתית', home: 'הכסף שלי', history: 'היסטוריה' },
    child: { home: '🏠 הכסף שלי', history: '📜 מה היה' },
    teen: { home: '💰 הכסף שלי', friends: '🤝 חברים', history: '📜 היסטוריה' },
  };

  function applyTheme(role) {
    if (role) document.body.dataset.theme = role; else delete document.body.dataset.theme;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', THEME_COLOR[role] || THEME_COLOR.child);
  }

  // ---------- הרכבת המסך הראשי ----------
  function renderApp() {
    const role = data.me.role;
    applyTheme(role);
    $('meAvatar').textContent = data.me.avatar;
    $('meName').textContent = data.me.name;
    $('familyName').textContent = data.family.name;
    if (isParent()) localStorage.setItem(CODE_KEY, data.family.childCode);
    document.querySelectorAll('.parent-only').forEach((n) => (n.hidden = !isParent()));
    document.querySelectorAll('.teen-only').forEach((n) => (n.hidden = !isTeen()));
    $('emailBtn').textContent = data.me.email ? '✉️ מייל לשחזור: ' + data.me.email : '✉️ הוספת מייל לשחזור קוד';

    const labels = TAB_LABELS[role] || TAB_LABELS.child;
    document.querySelectorAll('.tab').forEach((t) => {
      const count = t.dataset.tab === 'family' ? (isParent() ? parentPendingCount() : 0)
        : t.dataset.tab === 'friends' ? friendsInboxCount() : 0;
      t.replaceChildren(...[labels[t.dataset.tab] || t.textContent, count ? el('span', { class: 'badge', text: String(count) }) : null].filter((x) => x !== null));
    });

    const tbtn = $('teenRequestBtn');
    const mine = person(data.me.id);
    tbtn.hidden = role !== 'child';
    const asked = !!(mine && mine.teenRequested);
    tbtn.disabled = asked;
    tbtn.textContent = asked ? '⏳ הבקשה להפוך לנער/ה נשלחה להורים' : '🎧 בקשה להפוך לנער/ה';
    renderHome();
    renderPending();
    renderPushBtn();
    syncPush();
    renderEntries($('myHistory'), data.entries.filter((e) => e.from === data.me.id || e.to === data.me.id), 'עדיין לא נרשם כלום.');
    if (isParent()) renderFamily();
    if (isTeen()) renderFriends();

    if (!tabInit) {
      tabInit = true;
      switchTab(isParent() ? 'family' : 'home');
    } else {
      const active = document.querySelector('.tab.active').dataset.tab;
      if ((active === 'family' && !isParent()) || (active === 'friends' && !isTeen())) switchTab('home');
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ---------- אירועים ----------
  $('btnIOwe').addEventListener('click', () => openEntryFlow({ kind: 'debt', from: data.me.id }));
  $('btnTheyOwe').addEventListener('click', () => openEntryFlow({ kind: 'debt', to: data.me.id }));

  $('logoutBtn').addEventListener('click', async () => {
    await releasePushDevice();
    try { await call('auth:logout', { token }); } catch (e) { /* ignore */ }
    dropSession();
  });

  $('changePinBtn').addEventListener('click', () => {
    if (data.me.email) { openChangePinEmail(); return; }
    const oldPin = el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: 'current-password' });
    const newPin = el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: 'new-password' });
    const err = el('p', { class: 'error', role: 'alert' });
    openSheet('שינוי הקוד הסודי', el('div', { class: 'form' },
      el('label', { class: 'field' }, el('span', { text: 'הקוד הנוכחי' }), oldPin),
      el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), newPin),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'שמירה', onclick: async () => {
          if (!/^\d{4}$/.test(newPin.value)) { err.textContent = 'הקוד החדש צריך להיות 4 ספרות.'; return; }
          try {
            const res = await call('auth:changeMyPin', { token, oldPin: oldPin.value, newPin: newPin.value });
            if (res.ok) { closeSheet(); toast('הקוד שונה ✅'); }
            else if (res.reason === 'wrong') err.textContent = 'הקוד הנוכחי לא נכון.';
            else if (res.reason === 'locked') err.textContent = 'יותר מדי ניסיונות. נסו שוב עוד דקה.';
            else if (res.reason === 'useEmail') { closeSheet(); openChangePinEmail(); }
            else err.textContent = 'משהו השתבש. נסו שוב.';
          } catch (e) { err.textContent = errMsg(e); }
        },
      })));
  });

  const personPicker = avatarPicker($('personAvatars'));
  $('personForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = $('personName').value.trim();
    const pin = $('personPin').value;
    if (!name) return;
    if (pin && !/^\d{4}$/.test(pin)) { toast('הקוד צריך להיות 4 ספרות'); return; }
    try {
      await call('people:add', { token, name, role: $('personRole').value, avatar: personPicker.get(), pin: pin || undefined });
      $('personName').value = ''; $('personPin').value = '';
      toast(`${name} נוסף/ה למשפחה ✅`);
    } catch (e) { toast(errMsg(e)); }
  });

  $('exportBtn').addEventListener('click', () => {
    const out = {
      people: data.people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
      entries: data.entries.map((e) => ({ kind: e.kind, from: e.from, to: e.to, amount: e.amount, note: e.note, date: e.date })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `kupa-backup-${today()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('renameFamilyBtn').addEventListener('click', async () => {
    const name = prompt('איך לקרוא למשפחה?', data.family.name);
    if (name === null || !name.trim()) return;
    try { await call('family:rename', { token, name }); toast('השם עודכן ✅'); }
    catch (e) { toast(errMsg(e)); }
  });

  $('deleteFamilyBtn').addEventListener('click', async () => {
    const typed = prompt(`זה ימחק את כל הקופה: כל האנשים וכל הרשומות, ואי אפשר לבטל.\nכדי לאשר, כתבו את שם המשפחה: ${data.family.name}`);
    if (typed === null) return;
    try {
      await call('family:remove', { token, confirmName: typed });
      localStorage.removeItem(CODE_KEY);
      fam = null;
      toast('הקופה נמחקה');
      dropSession();
    } catch (e) { toast(errMsg(e)); }
  });

  $('importFile').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.people) || !Array.isArray(s.entries)) throw new Error('bad');
      if (!confirm(`להוסיף ${s.entries.length} רשומות מהקובץ? שום דבר קיים לא יימחק.`)) return;
      const res = await call('admin:importData', { token, ...cleanPayload(s) });
      toast(`נוספו ${res.added} רשומות`);
    } catch (e) {
      toast(e && e.data ? errMsg(e) : 'הקובץ לא נראה כמו גיבוי של הקופה');
    }
  });

  // ---------- התחלה ----------
  function init() {
    if (!window.CONVEX_URL || typeof convex === 'undefined') { show('noserver'); return; }
    client = new convex.ConvexClient(window.CONVEX_URL);
    client.onUpdate('auth:legacyRoster', {}, (r) => {
      legacyPeople = r;
      if (pinFlow && pinFlow.legacy) {
        const fresh = r.find((p) => p.id === pinFlow.person.id);
        if (!fresh) pinFlow = null;
        else { pinFlow.person = fresh; if (!fresh.hasPin && pinFlow.mode === 'login') pinFlow.mode = 'new'; }
      }
      route();
    }, () => {});
    subscribeData();
    restoreFamily().finally(() => { codeChecked = true; route(); });
    route();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
