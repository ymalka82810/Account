import Arrow from './Arrow.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, currentLang, LANGUAGES } from '../../i18n/index.js';
import { playKeyClick } from '../../lib/keyClick.js';
import {
  LAYOUTS, LAYOUT_LABEL, KEY_LABEL, layoutOrder, hasCase, shiftChar, autoShiftLayout, isKbTarget, kindOf, applyKey, wantsAutoShift, symbolRows,
  currentWord, suggest, applySuggestion, learnWord, personalWords,
} from '../../lib/keyboard.js';

// המקלדת של האפליקציה. מחליפה את מקלדת המערכת בכל שדה טקסט, ונראית לפי התפקיד (ילד/נוער/הורה, ראו .kb ב-style.css).
// מספרים בלבד בשדות מספר וקוד, אותיות בשדות טקסט. עובד גלובלית: מאזין ל-focusin במסמך, אז אין צורך לשנות שדות.
// איך מסתירים את מקלדת המערכת: inputmode="none" על השדה (נשמר המקור ב-data-kb-im). שדה עם data-native-kb נשאר עם מקלדת המערכת.

const DIGITS = [...'1234567890'];

// רשימות המילים הנפוצות להשלמה (public/words/<שפה>.txt), נטענות פעם אחת לשפה כשצריך.
const WORD_LANGS = new Set(['he', 'en', 'fr', 'nl', 'de', 'it', 'es', 'pt', 'el', 'ru', 'uk', 'sv', 'nb', 'da', 'pl', 'hu', 'cs', 'tr', 'ar']);
const dicts = /** @type {Record<string, string[] | Promise<string[]>>} */ ({});
function loadDict(/** @type {string} */ key) {
  if (!dicts[key]) {
    dicts[key] = fetch(new URL(`words/${key}.txt`, document.baseURI))
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => { const a = txt.split('\n').filter(Boolean); dicts[key] = a; return a; })
      .catch(() => { delete dicts[key]; return /** @type {string[]} */ ([]); });
  }
  return Promise.resolve(dicts[key]);
}
const caretOf = (/** @type {any} */ el) => { try { return el.selectionStart ?? el.value.length; } catch { return el.value.length; } };

function arm(/** @type {any} */ el) {
  if (el.getAttribute('inputmode') === 'none') return;
  el.dataset.kbIm = el.getAttribute('inputmode') ?? '';
  el.setAttribute('inputmode', 'none');
}
function disarm(/** @type {any} */ el) {
  if (el.dataset.kbIm == null) return;
  if (el.dataset.kbIm === '') el.removeAttribute('inputmode'); else el.setAttribute('inputmode', el.dataset.kbIm);
  delete el.dataset.kbIm;
}

function readState(/** @type {any} */ el) {
  const value = el.value;
  let start = value.length, end = value.length;
  try { if (el.selectionStart != null) { start = el.selectionStart; end = el.selectionEnd; } } catch { /* email/number: אין בחירה, כותבים בסוף */ }
  return { value, start, end, max: el.maxLength > -1 ? el.maxLength : Infinity };
}

function commit(/** @type {any} */ el, /** @type {{ value: string, caret: number }} */ r) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  // ה-setter המקורי, כדי ש-React (שעוטף את value) יזהה את השינוי ויפעיל onChange
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, r.value);
  try { el.setSelectionRange(r.caret, r.caret); } catch { /* */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function textFields(/** @type {any} */ from) {
  const root = from.form || from.closest('.sheet') || document;
  return /** @type {any[]} */ (Array.from(root.querySelectorAll('input, textarea'))).filter((e) => isKbTarget(e) && e.offsetParent !== null);
}

export default function AppKeyboard() {
  const [target, setTarget] = useState(/** @type {any} */ (null));
  const [kind, setKind] = useState('text');
  const [page, setPage] = useState('abc'); // abc | sym
  const [li, setLi] = useState(0); // מקום בסדר הפריסות של הגלובוס
  const [shift, setShift] = useState(0); // 0 כבוי, 1 לאות אחת, 2 נעול
  const [, setTick] = useState(0); // רינדור מחדש כשהטקסט או הסמן בשדה משתנים (להצעות)
  const [dictVer, setDictVer] = useState(0);
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const targetRef = useRef(/** @type {any} */ (null));
  const switching = useRef(false);
  const repeat = useRef(/** @type {any} */ ({ to: 0, iv: 0 }));
  const lang = currentLang();

  const hide = useCallback(() => { targetRef.current = null; setTarget(null); }, []);
  const show = useCallback((/** @type {any} */ el) => {
    if (targetRef.current === el) return;
    targetRef.current = el;
    const k = kindOf(el);
    setTarget(el); setKind(k); setPage('abc'); setLi(0);
    setShift(k === 'text' && autoShiftLayout(layoutOrder(currentLang(), k)[0]) && wantsAutoShift(el.value.slice(0, el.selectionStart ?? el.value.length)) ? 1 : 0);
  }, []);

  // האזנה גלובלית לפוקוס
  useEffect(() => {
    const onDown = (/** @type {any} */ e) => { if (isKbTarget(e.target) && !e.target.dataset.kbSys) arm(e.target); };
    const onIn = (/** @type {any} */ e) => {
      const el = e.target;
      if (!isKbTarget(el)) { if (!rootRef.current?.contains(el)) hide(); return; }
      if (el.dataset.kbSys) return;
      arm(el); show(el);
    };
    const onOut = (/** @type {any} */ e) => {
      const el = e.target;
      if (switching.current) return;
      if (el.dataset?.kbSys) { delete el.dataset.kbSys; arm(el); }
      setTimeout(() => {
        const a = document.activeElement;
        if (!isKbTarget(a) || /** @type {any} */ (a).dataset.kbSys) hide();
      }, 0);
    };
    // מסתירים את מקלדת המערכת מראש בכל שדה, לא רק כשהוא מקבל פוקוס: שינוי inputmode אחרי שהמקלדת של הטלפון כבר עלתה
    // לא תמיד מסתיר אותה. שדה שנוצר עם autoFocus מקבל את אותו טיפול דרך focus().
    const scan = (/** @type {any} */ root) => {
      if (isKbTarget(root) && !root.dataset.kbSys) arm(root);
      root.querySelectorAll?.('input, textarea').forEach((/** @type {any} */ f) => { if (isKbTarget(f) && !f.dataset.kbSys) arm(f); });
    };
    scan(document.body);
    const mo = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); })));
    mo.observe(document.body, { childList: true, subtree: true });
    const origFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focus(...a) {
      if (isKbTarget(this) && !(/** @type {any} */ (this)).dataset.kbSys) arm(this);
      return origFocus.apply(this, a);
    };
    // לחיצה על כפתור כשהמקלדת פתוחה לא מעבירה אליו פוקוס: אחרת המקלדת נסגרת, הפריסה קופצת והלחיצה הראשונה אובדת.
    // הכפתור עדיין מקבל click רגיל, והמקלדת נסגרת כשהחלון נסגר או כשלוחצים על שדה אחר / על ⌄.
    const onMouseDown = (/** @type {any} */ e) => {
      if (!targetRef.current || rootRef.current?.contains(e.target)) return;
      if (e.target.closest?.('button, [role="button"]')) e.preventDefault();
    };
    // שדה שיצא מהמסמך (למשל חלון שנסגר אחרי רישום) לא משאיר מקלדת פתוחה
    const mo2 = new MutationObserver(() => { if (targetRef.current && !targetRef.current.isConnected) hide(); });
    mo2.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    // שדה שכבר בפוקוס כשהמקלדת עולה (למשל autoFocus)
    if (isKbTarget(document.activeElement)) { arm(document.activeElement); show(document.activeElement); }
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onIn);
      mo2.disconnect();
      document.removeEventListener('focusout', onOut);
      mo.disconnect();
      HTMLElement.prototype.focus = origFocus;
    };
  }, [hide, show]);

  // מקום למקלדת: ריפוד בתחתית הדף וחלונות, וגלילה כך שהשדה לא יוסתר
  useEffect(() => {
    const body = document.body, root = document.documentElement;
    body.classList.toggle('kb-open', !!target);
    if (!target) { root.style.removeProperty('--kb-h'); return undefined; }
    const el = rootRef.current;
    const setH = () => root.style.setProperty('--kb-h', (el ? el.offsetHeight : 0) + 'px');
    setH();
    const ro = typeof ResizeObserver === 'function' && el ? new ResizeObserver(setH) : null;
    if (ro && el) ro.observe(el);
    const id = setTimeout(() => { try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* */ } }, 160);
    return () => { clearTimeout(id); if (ro) ro.disconnect(); };
  }, [target]);

  // מקלדת המערכת (כשעוברים אליה עם 🌐, או שדה עם data-native-kb): אין לנו גובה שלה, אז לוקחים אותו מה-visualViewport
  // ומעלים את החלונות מעליה, כדי שכפתורי החלון לא יוסתרו.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const sync = () => {
      if (targetRef.current) return; // המקלדת שלנו פתוחה והיא קובעת את --kb-h בעצמה
      const h = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const open = h > 120;
      document.body.classList.toggle('kb-open', open);
      if (open) root.style.setProperty('--kb-h', h + 'px'); else root.style.removeProperty('--kb-h');
      if (open && isKbTarget(document.activeElement)) {
        try { /** @type {any} */ (document.activeElement).scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* */ }
      }
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, []);

  const order = layoutOrder(lang, kind);
  const layout = order[Math.min(li, order.length - 1)];
  const letters = layout === 'sys' ? 'en' : layout;
  // רשימת המילים לפי הפריסה שנבחרה
  const dictKey = letters;
  const wantsSuggest = kind === 'text' && !!target && target.type !== 'password' && WORD_LANGS.has(dictKey);

  useEffect(() => {
    if (!target) return undefined;
    const bump = () => setTick((n) => n + 1);
    ['input', 'click', 'keyup'].forEach((ev) => target.addEventListener(ev, bump));
    return () => ['input', 'click', 'keyup'].forEach((ev) => target.removeEventListener(ev, bump));
  }, [target]);
  useEffect(() => {
    if (!wantsSuggest) return undefined;
    let live = true;
    loadDict(dictKey).then(() => { if (live) setDictVer((n) => n + 1); });
    return () => { live = false; };
  }, [wantsSuggest, dictKey]);

  const afterKey = useCallback((/** @type {any} */ el) => {
    setShift((s) => (s === 2 ? 2 : (kind === 'text' && autoShiftLayout(letters) && wantsAutoShift(el.value.slice(0, el.selectionStart ?? el.value.length)) ? 1 : 0)));
  }, [kind, letters]);

  function press(/** @type {string} */ key) {
    const el = targetRef.current;
    if (!el || !el.isConnected) return;
    if (key === 'enter') return enter(el);
    let ch = key;
    if (el.getAttribute('autocapitalize') === 'characters') ch = ch.toUpperCase();
    const st = readState(el);
    const r = applyKey(st, ch, kind);
    if (!r) return;
    // מילה שנגמרה (רווח או פיסוק) נזכרת להצעות הבאות
    if (kind === 'text' && el.type !== 'password' && /^[\s.,!?;:]$/.test(ch)) learnWord(currentWord(st.value.slice(0, st.start)));
    commit(el, r);
    afterKey(el);
  }

  function pick(/** @type {string} */ word) {
    const el = targetRef.current;
    if (!el || !el.isConnected) return;
    const r = applySuggestion(readState(el), word);
    if (!r) return;
    learnWord(word);
    commit(el, r);
    afterKey(el);
  }

  function enter(/** @type {any} */ el) {
    if (el.tagName === 'TEXTAREA') { const r = applyKey(readState(el), '\n', 'text'); if (r) commit(el, r); return; }
    const all = textFields(el);
    const next = all[all.indexOf(el) + 1];
    if (next) { next.focus(); return; }
    const form = el.form;
    el.blur();
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
  }

  function cycleLayout() {
    const nextIdx = (li + 1) % order.length;
    if (order[nextIdx] === 'sys') {
      // מקלדת המערכת לשדה הזה, עד שיוצאים ממנו
      const el = targetRef.current;
      if (!el) return;
      switching.current = true;
      el.dataset.kbSys = '1';
      disarm(el);
      hide();
      el.blur();
      setTimeout(() => { el.focus(); switching.current = false; }, 60);
      return;
    }
    setLi(nextIdx); setPage('abc'); setShift(0);
  }

  function stopRepeat() { clearTimeout(repeat.current.to); clearInterval(repeat.current.iv); }
  const down = (/** @type {string} */ key) => (/** @type {any} */ e) => {
    e.preventDefault();
    press(key);
    if (key === 'del') {
      stopRepeat();
      repeat.current.to = setTimeout(() => { repeat.current.iv = setInterval(() => press('del'), 65); }, 380);
    }
  };
  useEffect(() => {
    document.addEventListener('pointerup', stopRepeat);
    document.addEventListener('pointercancel', stopRepeat);
    return () => { stopRepeat(); document.removeEventListener('pointerup', stopRepeat); document.removeEventListener('pointercancel', stopRepeat); };
  }, []);
  const stop = stopRepeat;
  // מניעת מעבר פוקוס מהשדה למקש (מקלדת שגורמת לשדה לאבד פוקוס לא שימושית)
  const keep = (/** @type {any} */ e) => e.preventDefault();

  // פונקציה רגילה ולא קומפוננטה, כדי שהכפתורים לא יוחלפו בכל רינדור (אחרת מקש מחיקה לחוץ היה מאבד את ה-pointerup שלו)
  const Key = (/** @type {{ k: string, id?: string, label?: any, cls?: string, aria?: string, onDown?: any, grow?: number }} */ p) => {
    const { k, id, label, cls = '', aria, onDown, grow } = p;
    return (
      <button key={id ?? k} type="button" tabIndex={-1} className={'kb-key ' + cls} style={grow ? { flexGrow: grow } : undefined}
        aria-label={aria || (typeof label === 'string' ? label : k)}
        onPointerDown={(e) => { playKeyClick(k === ' ' ? 'space' : k === 'del' ? 'del' : k === 'enter' ? 'enter' : 'letter'); (onDown || down(k))(e); }} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onMouseDown={keep} onClick={keep}>
        {label ?? k}
      </button>
    );
  };

  if (!target) return null;

  const upper = (/** @type {string} */ c) => (hasCase(letters) && shift ? shiftChar(letters, c) : c);
  const enterKey = Key({ k: 'enter', label: '✓', cls: 'kb-enter', aria: t('אישור'), grow: 1.6 });
  const delKey = Key({ k: 'del', label: '⌫', cls: 'kb-del', aria: t('מחיקה'), grow: 1.5 });
  const tap = (/** @type {() => void} */ fn) => (/** @type {any} */ e) => { e.preventDefault(); fn(); };

  const sugg = wantsSuggest
    ? suggest(currentWord((target.value || '').slice(0, caretOf(target))),
      [personalWords(), /** @type {string[]} */ (Array.isArray(dicts[dictKey]) ? dicts[dictKey] : [])])
    : [];
  void dictVer;

  let body;
  if (kind === 'num' || kind === 'dec') {
    const rtl = LANGUAGES[/** @type {keyof typeof LANGUAGES} */ (lang)]?.dir === 'rtl';
    const cell = (/** @type {string} */ k) => Key({ k, cls: 'kb-digit' });
    body = (
      <div className="kb-numpad">
        {['1', '2', '3'].map(cell)}{delKey}
        {['4', '5', '6'].map(cell)}
        {Key({ k: 'enter', id: 'enter-tall', label: '✓', cls: 'kb-enter kb-enter-tall', aria: t('אישור') })}
        {['7', '8', '9'].map(cell)}
        {/* בעברית וערבית הנקודה מימין לאפס, כמו שקוראים: האפס באמצע והנקודה אחריו */}
        {rtl ? <span /> : (kind === 'dec' ? cell('.') : <span />)}{cell('0')}{rtl ? (kind === 'dec' ? cell('.') : <span />) : <span />}
      </div>
    );
  } else {
    const rows = page === 'sym' ? symbolRows(lang, kind) : LAYOUTS[/** @type {keyof typeof LAYOUTS} */ (letters)].map((r) => [...r]);
    const last = rows.length - 1;
    const onSym = page === 'sym';
    const toggleLabel = onSym ? ((/** @type {Record<string, string>} */ (LAYOUT_LABEL))[letters] ?? 'abc') : '?123';
    const spaceLabel = (LANGUAGES[/** @type {keyof typeof LANGUAGES} */ (letters)] || LANGUAGES.en).name;
    const compact = kind === 'email' || kind === 'latin';
    body = (
      <div className="kb-letters">
        {wantsSuggest && (
          <div className="kb-sugg" dir={letters === 'he' || letters === 'ar' ? 'rtl' : 'ltr'}>
            {sugg.map((w) => (
              <button key={w} type="button" tabIndex={-1} className="kb-sug" onPointerDown={tap(() => { playKeyClick('letter'); pick(w); })} onMouseDown={keep} onClick={keep}>{w}</button>
            ))}
          </div>
        )}
        {!onSym && <div className="kb-row kb-row-digits">{DIGITS.map((d) => Key({ k: d, cls: 'kb-digit' }))}</div>}
        {rows.map((r, i) => (
          <div className="kb-row" key={i}>
            {i === last && !onSym && hasCase(letters) && Key({ k: 'shift', label: shift === 2 ? '⇪' : '⇧', cls: 'kb-fn' + (shift ? ' on' : ''), aria: 'Shift', grow: 1.5, onDown: tap(() => setShift((s) => (s + 1) % 3)) })}
            {r.map((c) => Key({ k: upper(c), id: c, label: (/** @type {Record<string, string>} */ (KEY_LABEL))[c] }))}
            {i === last && delKey}
          </div>
        ))}
        <div className="kb-row kb-row-bottom">
          {Key({ k: 'page', label: toggleLabel, cls: 'kb-fn', aria: toggleLabel, grow: 1.5, onDown: tap(() => setPage(onSym ? 'abc' : 'sym')) })}
          {order.length > 1 && Key({ k: 'lang', label: '🌐', cls: 'kb-fn', aria: t('שפה'), onDown: tap(cycleLayout) })}
          {compact ? (
            <>
              {kind === 'email' && Key({ k: '@' })}
              {Key({ k: '-' })}{Key({ k: '.' })}
              {kind === 'email' && Key({ k: '_' })}
            </>
          ) : (
            <>
              {Key({ k: ',' })}
              {Key({ k: ' ', label: <span className="kb-space-name">{spaceLabel}</span>, cls: 'kb-space', aria: ' ', grow: 5 })}
              {Key({ k: '.' })}
            </>
          )}
          {enterKey}
        </div>
      </div>
    );
  }

  return createPortal(
    <div className={'kb ' + (kind === 'num' || kind === 'dec' ? 'kb-numeric' : 'kb-text')} ref={rootRef} dir="ltr" role="group" lang={lang}
      onMouseDown={keep}>
      <button type="button" tabIndex={-1} className="kb-close" aria-label={t('סגירה')}
        onPointerDown={(e) => { e.preventDefault(); const el = targetRef.current; hide(); if (el) el.blur(); }} onMouseDown={keep} onClick={keep}><Arrow kind="down" /></button>
      {body}
    </div>,
    document.body,
  );
}
