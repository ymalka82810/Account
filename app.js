(() => {
  'use strict';

  const TOKEN_KEY = 'kupa-token';
  const LEGACY_KEY = 'family-account-v1';
  const LEGACY_DONE_KEY = 'kupa-legacy-imported';
  const CODE_KEY = 'kupa-code';
  const DEVICE_KEY = 'kupa-device';
  const UNDO_MS = 10 * 60 * 1000;
  const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '🐨', '🐶', '🐱', '🚀'];

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

  // ---------- helpers ----------
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (typeof v === 'boolean') n[k] = v;
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
  const AUTH_CALLS = ['auth:enter', 'auth:join', 'auth:login', 'auth:claimProfile'];
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
    window.scrollTo({ top: 0 });
  }

  // ---------- חישובים ----------
  const person = (id) => (data ? data.people.find((p) => p.id === id) : null);
  const isMe = (id) => !!data && id === data.me.id;
  const isParent = () => !!data && data.me.role === 'parent';
  const nameOf = (id) => (person(id) ? person(id).name : 'לא ידוע');
  const subjectWord = (id) => (isMe(id) ? 'אני' : nameOf(id));
  const toWord = (id) => (isMe(id) ? 'לי' : 'ל' + nameOf(id));

  // כמה a חייב ל-b (יכול להיות שלילי)
  function pairOwes(a, b) {
    let sum = 0;
    for (const e of data.entries) {
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
    data = undefined;
    if (!token) return;
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
    data = undefined;
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
  $('codeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showCodeError('');
    try {
      const r = await enterFamily($('codeInput').value, true);
      if (r === true) { $('codeInput').value = ''; view = 'welcome'; route(); }
      else if (r === 'throttled') showCodeError('יותר מדי ניסיונות. נסו שוב עוד דקה.');
      else showCodeError('הקוד לא נכון. בדקו שוב, או בקשו מההורים.');
    } catch (e) { showCodeError(errMsg(e)); }
  });

  $('newFamilyBtn').addEventListener('click', () => { view = 'setup'; route(); });

  // ---------- הקמת משפחה חדשה ----------
  let setupPicker = null;
  function initSetup() {
    if (!setupPicker) setupPicker = avatarPicker($('setupAvatars'));
  }
  $('setupBack').addEventListener('click', () => { view = 'welcome'; route(); });
  $('setupForm').addEventListener('submit', async (ev) => {
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
  });

  // ---------- הצטרפות עם קוד ----------
  let joinPicker = null;
  function initJoin() {
    if (!joinPicker) joinPicker = avatarPicker($('joinAvatars'));
    $('joinHint').textContent = fam.codeRole === 'parent'
      ? `מצטרפים לקופה של ${fam.name} בתור הורה.`
      : `מצטרפים לקופה של ${fam.name} בתור ילד/ה.`;
  }
  $('joinBack').addEventListener('click', () => { view = 'welcome'; route(); });
  $('joinForm').addEventListener('submit', async (ev) => {
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
  });

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
    $('pinError').textContent = error;
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
    const st = { from: opts.from || null, to: opts.to || null, amount: '', agorot: 0, note: '' };
    const body = el('div', { class: 'flow' });
    const maxAmount = opts.kind === 'payment' && opts.suggest ? opts.suggest : null;
    let opened = false;

    const titleFor = () => {
      if (opts.kind === 'debt') return isMe(st.from) ? 'אני חייב/ת כסף' : 'חייבים לי כסף';
      return isMe(st.from) ? 'שילמתי' : isMe(st.to) ? 'קיבלתי כסף' : 'רישום החזר';
    };

    function openOrUpdate() {
      if (opened) { $('sheetTitle').textContent = titleFor(); return; }
      opened = true;
      openSheet(titleFor(), body);
    }

    function stepPerson() {
      const fixed = st.from || st.to;
      const others = data.people.filter((p) => p.id !== fixed);
      const q = opts.kind === 'debt'
        ? (isMe(st.from) ? 'למי אני חייב/ת?' : 'מי חייב/ת לי?')
        : 'עם מי?';
      body.replaceChildren(
        el('p', { class: 'flow-q', text: q }),
        el('div', { class: 'tiles' }, others.map((p) => el('button', {
          class: 'tile', type: 'button',
          onclick: () => { if (st.from) st.to = p.id; else st.from = p.id; stepAmount(); },
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
          if (maxAmount && agorot > maxAmount) { err.textContent = `אפשר להחזיר עד ${money(maxAmount)}.`; return; }
          st.agorot = agorot;
          stepFinal();
        },
      });

      body.replaceChildren(
        el('p', { class: 'flow-q', text: question }), disp, el('div', { class: 'chips' }, chips), pad, err, next);
      refresh();
      openOrUpdate();
    }

    function stepFinal() {
      const isDebt = opts.kind === 'debt';
      const noteInput = el('input', { type: 'text', maxlength: '80', placeholder: 'למשל: גלידה, כרטיס לסרט' });
      noteInput.value = st.note;
      noteInput.addEventListener('input', () => { st.note = noteInput.value; });
      const err = el('p', { class: 'error', role: 'alert' });

      const sentence = `${subjectWord(st.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(st.to)} ${money(st.agorot)}`;

      const saveBtn = el('button', { type: 'button', class: 'primary', text: isDebt ? '✅ שמירת החוב' : '✅ שמירת ההחזר' });
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          await call('entries:add', {
            token, kind: opts.kind, from: st.from, to: st.to, amount: st.agorot,
            note: isDebt ? st.note.trim() : (st.note.trim() || 'החזר'), date: today(),
          });
          closeSheet();
          toast(isDebt ? 'החוב נשמר ✅' : 'ההחזר נשמר ✅');
          switchTab('home');
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

    if (!st.from || !st.to) stepPerson(); else stepAmount();
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
      cards.push(el('div', { class: 'debt ' + (iOwe ? 'owe' : 'get') },
        el('span', { class: 'avatar-md', 'aria-hidden': 'true', text: p.avatar }),
        el('div', { class: 'text' },
          el('div', { class: 'who', text: iOwe ? `אני חייב/ת ל${p.name}` : `${p.name} חייב/ת לי` }),
          el('div', { class: 'amt', text: money(amount) })),
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
  const canDelete = (e) => isParent() || (e.createdBy === data.me.id && Date.now() - e.createdAt < UNDO_MS);

  function renderEntries(box, list, emptyText) {
    box.replaceChildren();
    if (!list.length) { box.append(el('div', { class: 'empty', text: emptyText })); return; }
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).forEach((e) => {
      const isDebt = e.kind === 'debt';
      const title = `${subjectWord(e.from)} ${isDebt ? 'חייב/ת' : 'החזיר/ה'} ${toWord(e.to)}`;
      const row = el('div', { class: 'row' },
        el('div', { class: 'text' },
          el('div', {}, el('span', { class: 'tag ' + e.kind, text: isDebt ? 'חוב' : 'החזר' }), ' ', title),
          el('div', { class: 'meta', text: [fmtDate(e.date), e.note].filter(Boolean).join(' • ') })),
        el('strong', { text: money(e.amount) }));
      if (canDelete(e)) {
        row.append(el('button', {
          class: 'small danger', type: 'button', text: isParent() ? 'מחיקה' : 'ביטול',
          onclick: async () => {
            if (!confirm(isParent() ? 'למחוק את הרשומה הזאת?' : 'לבטל את מה שרשמת?')) return;
            try { await call('entries:remove', { token, id: e.id }); toast('הרשומה נמחקה'); }
            catch (err) { toast(errMsg(err)); }
          },
        }));
      }
      box.append(row);
    });
  }

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
        el('span', { class: 'meta', text: (p.role === 'parent' ? 'הורה' : 'ילד/ה') + (p.hasPin ? '' : ' • עוד לא בחר/ה קוד') }),
        p.lockAlert ? el('div', { class: 'meta', style: 'color:#b45309', text: `⚠️ הקוד של ${p.name} ננעל ${p.lockAlert.count === 1 ? 'פעם אחת' : p.lockAlert.count + ' פעמים'} אחרי ניסיונות שגויים. אם זה לא הוא/היא, כדאי לקבוע קוד חדש.` }) : null),
      el('button', { class: 'small', type: 'button', text: 'קוד חדש', onclick: () => openResetPin(p) }),
      p.id === data.me.id ? null : el('button', {
        class: 'small danger', type: 'button', text: 'הסרה', 'aria-label': 'הסרת ' + p.name,
        onclick: async () => {
          if (!confirm(`להסיר את ${p.name} מהמשפחה?`)) return;
          try { await call('people:remove', { token, id: p.id }); toast(`${p.name} הוסר/ה`); }
          catch (e) { toast(errMsg(e)); }
        },
      }))));

    renderEntries($('allHistory'), data.entries, 'עדיין אין רשומות.');
    renderCodes();
    renderLegacy();
  }

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
    const input = el('input', { type: 'password', inputmode: 'numeric', maxlength: '4', autocomplete: 'new-password' });
    const err = el('p', { class: 'error', role: 'alert' });
    const run = async (pin) => {
      try {
        await call('auth:resetPin', { token, personId: p.id, pin });
        closeSheet();
        toast(pin ? `הקוד של ${p.name} עודכן` : `${p.name} יבחר/תבחר קוד חדש בכניסה הבאה`);
      } catch (e) { err.textContent = errMsg(e); }
    };
    openSheet('קוד סודי ל' + p.name, el('div', { class: 'form' },
      el('label', { class: 'field' }, el('span', { text: 'קוד חדש (4 ספרות)' }), input),
      err,
      el('button', {
        class: 'primary', type: 'button', text: 'קביעת הקוד', onclick: () => {
          if (!/^\d{4}$/.test(input.value)) { err.textContent = 'הקוד צריך להיות 4 ספרות.'; return; }
          run(input.value);
        },
      }),
      el('button', { class: 'ghost', type: 'button', text: 'לאפס, ושיבחרו לבד בכניסה הבאה', onclick: () => run(undefined) })));
  }

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

  // ---------- הרכבת המסך הראשי ----------
  function renderApp() {
    $('meAvatar').textContent = data.me.avatar;
    $('meName').textContent = data.me.name;
    $('familyName').textContent = data.family.name;
    if (isParent()) localStorage.setItem(CODE_KEY, data.family.childCode);
    document.querySelectorAll('.parent-only').forEach((n) => (n.hidden = !isParent()));
    renderHome();
    renderEntries($('myHistory'), data.entries.filter((e) => e.from === data.me.id || e.to === data.me.id), 'עדיין לא נרשם כלום.');
    if (isParent()) renderFamily();
    else if (document.querySelector('.tab.active').dataset.tab === 'family') switchTab('home');
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
    try { await call('auth:logout', { token }); } catch (e) { /* ignore */ }
    dropSession();
  });

  $('changePinBtn').addEventListener('click', () => {
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
