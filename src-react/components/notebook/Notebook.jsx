import Arrow from '../shared/Arrow.jsx';
import { useEffect, useRef, useState } from 'react';
import { t, intlLocale } from '../../i18n/index.js';
import LanguagePicker from '../shared/LanguagePicker.jsx';
import LocalePicker from '../shared/LocalePicker.jsx';
import PalettePicker from '../shared/PalettePicker.jsx';
import { GoldBarArt, SumNum } from '../shared/GoldBar.jsx';
import { today, toast } from '../../lib/helpers.js';
import { money, fmtDate } from '../../lib/computations.js';
import { currencySymbol } from '../../lib/currencies.js';
import {
  useNotebook, NB_SHARED_KEY, notebookCurrency, addEntry, setPaid, removeEntry, restoreEntry, setSetting, setCurrencyChoice, clearPaid, clearAll,
  topPeople, searchPeople, similarPeople, renamePerson, normName, offsetCandidates, offsetPerson,
} from '../../lib/notebook.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import { useConfirm } from '../shared/Confirm.jsx';
import Select from '../shared/Select.jsx';
import { closeNotebook, goView, upgradeFromNotebook, deviceHasFamily } from '../../state/auth.js';
import { In } from '../auth/parts.jsx';
import UiIcon, { withIcons } from '../shared/UiIcon.jsx';
import { NB_DRAFT_KEY, loadDraft, saveDraft, clearDraft } from '../../lib/draft.js';
import { reducedMotion } from '../../lib/feel.js';

// הפנקס האישי: כל אחד (גם ילד/ה) רושם לעצמו למי הוא חייב ומי חייב לו.
// הכול נשמר במכשיר, בלי כניסה. זה מסך הפתיחה של מכשיר חדש. המשפחה היא שדרוג: אחרי הרישום הראשון
// מוצע להקים קופה משפחתית, ומי שיש לו קוד משפחה נכנס אליה מהקישור בתחתית.
// שני עמודים: ראשי (סיכום, כפתורי רישום, רשימה) והגדרות (מראה, מטבע, רשימה, נתונים).
// ההגדרות נפתחות עם #nb-settings בכתובת, כדי שכפתור "חזרה" של הטלפון יחזיר לעמוד הראשי.
const SETTINGS_HASH = '#nb-settings';
const pageFromHash = () => (location.hash === SETTINGS_HASH ? 'settings' : 'home');

// מעל כמה רישומים מופיע חיפוש בעמוד הראשי
const SEARCH_MIN = 8;

const sharedWithParents = () => { try { return localStorage.getItem(NB_SHARED_KEY) === '1'; } catch (e) { return false; } };

// טיוטה של רישום שלא נשמר (רענון או סגירת האפליקציה באמצע): פותחים אותה שוב, פעם אחת בכל טעינה של הדף.
let draftChecked = false;

export default function Notebook({ current }) {
  const nb = useNotebook();
  const sheet = useSheet();
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    if (current !== 'notebook' || page !== 'home' || draftChecked) return undefined;
    // בטיימר: ב-App יש אפקט שסוגר חלונות בטעינה הראשונה, והוא רץ אחרי האפקטים של הילדים
    const id = setTimeout(() => {
      draftChecked = true;
      const dir = ['iowe', 'owed'].find((d) => loadDraft(NB_DRAFT_KEY + '-' + d));
      if (dir) sheet.open('', <AddEntry initialDir={dir} />);
    }, 0);
    return () => clearTimeout(id);
  }, [current, page, sheet]);

  useEffect(() => {
    const sync = () => setPage(pageFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => { if (current === 'notebook') window.scrollTo({ top: 0 }); }, [page, current]);

  // הגלגל מסתובב במקום, ורק אחרי רגע ההגדרות נמשכות פנימה מהצד שלו
  const [pulling, setPulling] = useState(false);
  const openSettings = () => {
    if (pulling) return;
    const reduce = reducedMotion();
    if (reduce) { location.hash = SETTINGS_HASH; setPage('settings'); return; }
    setReturned(false);
    setPulling(true);
    setTimeout(() => { setPulling(false); location.hash = SETTINGS_HASH; setPage('settings'); }, 250);
  };
  // סגירה: הגלגל מסתובב לכיוון ההפוך, וכל התנועה ימינה כמו גלילה של הדף:
  // ההגדרות יוצאות ימינה והעמוד הראשי נכנס משמאל
  const [closing, setClosing] = useState(false);
  const [returned, setReturned] = useState(false);
  const leaveSettings = () => {
    if (location.hash === SETTINGS_HASH) history.back();
    else setPage('home');
  };
  const closeSettings = () => {
    if (closing) return;
    const reduce = reducedMotion();
    if (reduce) { leaveSettings(); return; }
    setClosing(true);
    setTimeout(() => { setClosing(false); setReturned(true); leaveSettings(); }, 250);
  };

  return (
    <In screen="notebook" current={current}>
      {page === 'home' ? <Home nb={nb} onSettings={openSettings} pulling={pulling} returned={returned} family={deviceHasFamily()} /> : <Settings nb={nb} onBack={closeSettings} closing={closing} />}
    </In>
  );
}

// ---------- עמוד ראשי ----------
function Home({ nb, onSettings, pulling, returned, family }) {
  const sheet = useSheet();
  const confirm = useConfirm();
  const cur = notebookCurrency();
  const { sort, showPaid } = nb.settings;
  const sorted = (list) => [...list].sort((a, b) =>
    sort === 'amount' ? b.amount - a.amount
      : sort === 'name' ? a.name.localeCompare(b.name, intlLocale())
        : 0); // 'new': הרשימה כבר מהחדש לישן
  const open = sorted(nb.entries.filter((e) => !e.paid));
  const done = sorted(nb.entries.filter((e) => e.paid));
  // חיפוש מופיע רק כשהרשימה ארוכה (מעל SEARCH_MIN רישומים בסך הכול), כדי לא להכביד על המסך כשהיא קצרה.
  // הסיכומים למעלה תמיד מכל הרישומים הפתוחים, גם כשהחיפוש מסנן את הרשימה.
  const [q, setQ] = useState('');
  const showSearch = nb.entries.length > SEARCH_MIN;
  const query = showSearch ? q.trim() : '';
  const matches = (e) => {
    const needle = query.toLowerCase();
    const amt = (e.amount / 100).toFixed(2);
    return e.name.toLowerCase().includes(needle) || (e.note || '').toLowerCase().includes(needle)
      || amt.includes(needle.replace(',', '.')) || money(e.amount, cur).includes(query);
  };
  const shownOpen = query ? open.filter(matches) : open;
  const shownDone = query ? done.filter(matches) : done;
  const nothingFound = !!query && !shownOpen.length && !(showPaid && shownDone.length);
  const sum = (d) => open.filter((e) => e.dir === d).reduce((s, e) => s + e.amount, 0);

  const offers = offsetCandidates(nb);
  const offset = async (c) => {
    const amount = money(c.overlap, cur);
    if (!(await confirm({
      icon: '⚖️',
      title: t('קיזוז חובות הדדיים'),
      amount,
      message: t('החובות בינך לבין {name} ייסגרו עד גובה הסכום הזה, ויישאר רק ההפרש. ההיסטוריה נשמרת.', { name: c.person.name }),
      cancelText: t('חזרה'),
    }))) return;
    offsetPerson(c.person.id);
    toast(t('קוזזו {amount} מול {name} ✅', { amount, name: c.person.name }));
  };
  const del = async (e) => {
    if (!(await confirm({ icon: <UiIcon name="trash" />, title: t('מחיקה'), message: t('למחוק את הרישום של {name}?', { name: e.name }), okText: t('מחיקה'), cancelText: t('חזרה'), danger: true }))) return;
    const gone = removeEntry(e.id);
    // "בטל" מחזיר את הרישום בדיוק כמו שהיה: אותו מזהה, תאריך ומקום ברשימה
    toast(t('נמחק'), gone ? { label: t('בטל'), onClick: () => restoreEntry(gone.entry, gone.index) } : undefined);
  };
  // "שולם" / "עוד לא": משוב מיידי עם ביטול, כמו במחיקה
  const pay = (e) => {
    const was = e.paid;
    setPaid(e.id, !was);
    toast(was ? t('חזר לרשימה הפתוחה') : t('סומן כשולם'), { label: t('בטל'), onClick: () => setPaid(e.id, was) });
  };
  const row = (e) => (
    <div className={'row' + (e.paid ? ' paid' : '')} key={e.id}>
      <div className="text">
        <strong>{e.name}</strong>
        <div className="meta">{e.dir === 'iowe' ? t('אני חייב') : t('חייב/ת לי')}{e.note ? ' • ' + e.note : ''} • {fmtDate(e.date)}</div>
      </div>
      <strong>{money(e.amount, cur)}</strong>
      <div className="acts">
        <button className="small" type="button" onClick={() => pay(e)}>{e.paid ? <><Arrow kind="return" /> {t('עוד לא')}</> : withIcons(t('✅ שולם'))}</button>
        <RowMenu onDelete={() => del(e)} />
      </div>
    </div>
  );

  return (
    <div className={'nb-page' + (pulling ? ' nb-pulled' : '') + (returned ? ' nb-push-back' : '')}>
      <div className="nb-head">
        {family
          ? <button className="ghost nb-fam-btn" type="button" onClick={closeNotebook}>{t('חזרה למשפחה')}</button>
          : <button className="ghost nb-fam-btn" type="button" onClick={() => sheet.open(t('🏠 צור משפחה'), <FamilyEntry />)}>{withIcons(t('🏠 צור משפחה'))}</button>}
        <h1>{withIcons(t('📒 הפנקס שלי'))}</h1>
        <button className={'ghost nb-gear' + (pulling ? ' nb-gear-spin' : '')} type="button" aria-label={t('הגדרות')} onClick={onSettings}>
          <span className="nb-gear-ico"><UiIcon name="gear" inline /></span>
        </button>
      </div>

      {sharedWithParents() && <p className="hint">{t('🔒 ההורים שלך יכולים לראות את הפנקס הזה, לצפייה בלבד.')}</p>}

      <div className="summary">
        <div className="sum owe"><GoldBarArt /><div className="lbl">{t('אני חייב')}</div><SumNum amount={sum('iowe')} cur={cur} /></div>
        <div className="sum get"><GoldBarArt /><div className="lbl">{t('חייבים לי')}</div><SumNum amount={sum('owed')} cur={cur} /></div>
      </div>

      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => sheet.open('', <AddEntry initialDir="iowe" />)}>
          <UiIcon name="fly-money" />{t('אני חייב כסף')}
        </button>
        <button className="bigbtn get" type="button" onClick={() => sheet.open('', <AddEntry initialDir="owed" />)}>
          <UiIcon name="handshake" />{t('חייבים לי כסף')}
        </button>
      </div>

      <h2 className="nb-h2">{t('מה פתוח')}</h2>
      {showSearch && (
        <div className="nb-find" role="search">
          <input type="text" maxLength={60} autoComplete="off" value={q} placeholder={t('חיפוש לפי שם, הערה או סכום')} aria-label={t('חיפוש לפי שם, הערה או סכום')}
            onChange={(ev) => setQ(ev.target.value)} />
          {q && <button className="ghost nb-find-clear" type="button" aria-label={t('ניקוי החיפוש')} onClick={() => setQ('')}>✕</button>}
        </div>
      )}
      {nothingFound
        ? (
          <div className="empty" role="status">
            <div className="big-emoji" aria-hidden="true">🔎</div>{t('לא נמצא כלום עבור “{q}”', { q: query })}
            <button className="ghost" type="button" onClick={() => setQ('')}>{t('ניקוי החיפוש')}</button>
          </div>
        )
        : open.length > 0
          ? (shownOpen.length > 0 && <div className="list">{shownOpen.map(row)}</div>)
          : <div className="empty"><div className="big-emoji" aria-hidden="true">{nb.entries.length ? '🎉' : '📝'}</div>{nb.entries.length ? t('אין כלום פתוח!') : t('עוד אין כלום ברשימה. לחצו על אחד הכפתורים כדי להתחיל.')}</div>}

      {offers.length > 0 && (
        <section className="card nb-offset">
          <h3>{t('⚖️ קיזוז חובות')}</h3>
          <p className="hint">{t('יש אנשים שאתם חייבים להם וגם הם חייבים לכם. קיזוז סוגר את החובות ההדדיים ומשאיר רק את ההפרש.')}</p>
          {offers.map((c) => (
            <div className="nb-offset-row" key={c.person.id}>
              <div className="text">
                <strong>{c.person.name}</strong>
                <div className="meta">{t('אני חייב {a} • חייב/ת לי {b}', { a: money(c.iowe, cur), b: money(c.owed, cur) })}</div>
              </div>
              <button className="small" type="button" onClick={() => offset(c)}>{t('⚖️ קיזוז ({amount})', { amount: money(c.overlap, cur) })}</button>
            </div>
          ))}
        </section>
      )}

      {showPaid && shownDone.length > 0 && (
        <details className="nb-paid" open={query ? true : undefined}>
          <summary>{t('שולמו ({n})', { n: shownDone.length })}</summary>
          <div className="list">{shownDone.map(row)}</div>
        </details>
      )}

    </div>
  );
}

// תפריט "⋯" בשורה: פעולות משניות (מחיקה) רחוקות מ"שולם", כדי שלא ילחצו עליהן בטעות. נסגר בלחיצה בחוץ או ב-Escape.
function RowMenu({ onDelete }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (ev) => { if (box.current && !box.current.contains(ev.target)) setOpen(false); };
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="row-menu" ref={box}>
      <button className="small" type="button" aria-label={t('עוד פעולות')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button className="small danger" type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }}>{withIcons(t('🗑️ מחיקה'))}</button>
        </div>
      )}
    </div>
  );
}

// נקודת הכניסה היחידה למשפחה מהפנקס: להקים קופה חדשה או להיכנס עם קוד משפחה.
function FamilyEntry() {
  const sheet = useSheet();
  return (
    <div className="form">
      <p><strong>{t('רוצים שהחייבים יראו את זה?')}</strong> {t('צרו קופה משפחתית: כולם רואים את אותו חשבון, והחובות מתעדכנים לכולם.')}</p>
      <button className="primary" type="button" onClick={() => { sheet.close(); upgradeFromNotebook('setup'); }}>{withIcons(t('🏠 יצירת קופה משפחתית'))}</button>
      <button className="ghost" type="button" onClick={() => { sheet.close(); goView('welcome'); }}>{t('יש לכם קוד משפחה? כניסה לקופה')}</button>
    </div>
  );
}

// ---------- רישום חדש (חלון קופץ) ----------
// מי שנרשם פעם נשמר כשם ידוע: אפשר לבחור אותו שוב בלחיצה. שם חדש שדומה לשם ידוע (דני/דניאל)
// לא נרשם בשקט: שואלים אם לאחד, ואם כן באיזה שם להשתמש.
function AddEntry({ initialDir }) {
  const sheet = useSheet();
  const nb = useNotebook();
  const dir = initialDir;
  // טיוטה: מה שהוקלד נשמר במכשיר עד השמירה או הסגירה של הטופס (ראו lib/draft.js)
  const draftKey = NB_DRAFT_KEY + '-' + dir;
  const [form, setForm] = useState(() => {
    const d = loadDraft(draftKey) || {};
    return { name: String(d.name || '').slice(0, 30), amount: String(d.amount || '').slice(0, 14), note: String(d.note || '').slice(0, 60) };
  });
  useEffect(() => { saveDraft(draftKey, form); }, [draftKey, form]);
  useEffect(() => () => clearDraft(draftKey), [draftKey]);
  const [personId, setPersonId] = useState(null); // נבחר מהרשימה הידועה
  const [similar, setSimilar] = useState(null); // {name, amount, people} בזמן שאלת האיחוד
  const [error, setError] = useState('');
  const [bad, setBad] = useState(''); // השדה החסר: 'name' | 'amount'
  const nameRef = useRef(null);
  const amountRef = useRef(null);
  const errRef = useRef(null);
  useSheetTitle(dir === 'iowe' ? t('אני חייב כסף') : t('חייבים לי כסף'));
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); setBad(''); if (k === 'name') setPersonId(null); };

  const people = nb.people;
  const typed = normName(form.name);
  // בלי הקלדה: שלושת השמות הכי בשימוש. בהקלדה: רשימת חיפוש, ומי שיש איתו חוב פתוח קודם.
  const chips = typed ? searchPeople(nb, form.name) : topPeople(nb, 3);
  const pick = (p) => { setForm((f) => ({ ...f, name: p.name })); setPersonId(p.id); setError(''); };

  const save = (name, amount, id) => {
    addEntry({ dir, name: name.slice(0, 30), amount, note: form.note.trim().slice(0, 60), date: today(), personId: id });
    sheet.close();
  };

  const submit = (ev) => {
    ev.preventDefault();
    const name = form.name.trim();
    const amount = Math.round(parseFloat(String(form.amount).replace(',', '.')) * 100);
    // שגיאה גלויה: מסמנים את השדה, מחזירים אליו פוקוס (המקלדת נשארת) וגוללים להודעה
    const fail = (msg, field, ref) => {
      setError(msg); setBad(field);
      ref.current?.focus();
      setTimeout(() => errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    };
    if (!name) return fail(t('כתבו את השם'), 'name', nameRef);
    if (!Number.isFinite(amount) || amount <= 0) return fail(t('כתבו סכום'), 'amount', amountRef);
    if (amount > 1e9) return fail(t('הסכום גדול מדי'), 'amount', amountRef);
    const exact = personId || (people.find((p) => normName(p.name) === typed) || {}).id;
    if (!exact) {
      const near = similarPeople(name, nb);
      if (near.length) { setSimilar({ name, amount, people: near }); return; }
    }
    save(name, amount, exact);
  };

  // שאלת האיחוד: שם דומה לאדם ידוע
  if (similar) {
    const { name, amount, people: near } = similar;
    const p = near[0];
    const pick1 = (keepName) => {
      // אותו אדם: הרישום החדש נרשם על האדם הידוע, והשם הסופי הוא מה שנבחר (גם בכל הרישומים הקודמים)
      if (keepName !== p.name) renamePerson(p.id, keepName.slice(0, 30));
      save(keepName, amount, p.id);
    };
    return (
      <div className="form">
        <p><strong>{t('יש כבר “{old}” בפנקס.', { old: p.name })}</strong> {t('זה אותו אדם כמו “{name}”?', { name })}</p>
        <button className="primary" type="button" onClick={() => pick1(p.name)}>{t('כן, אותו אדם. להשאיר “{n}”', { n: p.name })}</button>
        <button className="primary" type="button" onClick={() => pick1(name)}>{t('כן, אותו אדם. לשנות הכול ל“{n}”', { n: name })}</button>
        <button className="ghost" type="button" onClick={() => save(name, amount, undefined)}>{t('לא, זה אדם אחר')}</button>
        <button className="ghost" type="button" onClick={() => setSimilar(null)}>{t('חזרה')}</button>
      </div>
    );
  }

  return (
    <form className="form" autoComplete="off" onSubmit={submit}>
      <label className="field"><span>{dir === 'iowe' ? t('למי?') : t('מי חייב לי?')}</span>
        <input ref={nameRef} type="text" maxLength={30} autoFocus aria-invalid={bad === 'name'} className={bad === 'name' ? 'invalid' : undefined} value={form.name} onChange={set('name')} /></label>
      {chips.length > 0 && (
        <div className={'nb-opts' + (typed ? ' nb-search' : '')} role="group" aria-label={t('שמות מוכרים')}>
          {chips.map((p) => (
            <button key={p.id} type="button" className={'ghost' + (personId === p.id ? ' active' : '')} onClick={() => pick(p)}>{p.name}</button>
          ))}
        </div>
      )}
      <label className="field"><span>{t('כמה?')}</span>
        <span className="amt-field"><span className="amt-cur" aria-hidden="true">{currencySymbol(notebookCurrency())}</span>
          <input ref={amountRef} type="text" inputMode="decimal" dir="ltr" placeholder="0" aria-invalid={bad === 'amount'} className={bad === 'amount' ? 'invalid' : undefined} value={form.amount} onChange={set('amount')} /></span></label>
      <label className="field"><span>{t('על מה? (אפשר לדלג)')}</span>
        <input type="text" maxLength={60} value={form.note} onChange={set('note')} /></label>
      {error && <p className="error" role="alert" ref={errRef}>{error}</p>}
      <button className="primary" type="submit">{t('רישום')}</button>
    </form>
  );
}

// ---------- הגדרות ----------
// פונקציות ולא קבועים: התרגום נקרא בזמן הרינדור, בשפה הנוכחית.
const looks = () => [['kid', t('🌈 צבעוני')], ['dark', t('🌙 כהה')], ['neon', t('⚡ ניאון')]];
const sizes = () => [['small', t('קטן')], ['normal', t('רגיל')], ['large', t('גדול')], ['xlarge', t('ענק')]];
const sorts = () => [
  { value: 'new', label: t('הכי חדש קודם') },
  { value: 'amount', label: t('הסכום הגדול קודם') },
  { value: 'name', label: t('לפי שם (א-ב)') },
];

function Opts({ value, options, onPick, label }) {
  return (
    <div className="nb-opts" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id}
          className={'ghost' + (value === id ? ' active' : '')} onClick={() => onPick(id)}>{text}</button>
      ))}
    </div>
  );
}

function listAsText(nb, cur) {
  const line = (e) => `${e.dir === 'iowe' ? t('אני חייב ל{name}', { name: e.name }) : t('{name} חייב/ת לי', { name: e.name })}: ${money(e.amount, cur)}${e.note ? ` (${e.note})` : ''}`;
  const open = nb.entries.filter((e) => !e.paid);
  return open.length ? open.map(line).join('\n') : t('אין כלום פתוח');
}

function Settings({ nb, onBack, closing }) {
  const confirm = useConfirm();
  const s = nb.settings;
  const cur = notebookCurrency();
  const paidCount = nb.entries.filter((e) => e.paid).length;

  const copy = async () => {
    try { await navigator.clipboard.writeText(listAsText(nb, cur)); toast(t('הרשימה הועתקה')); }
    catch (e) { toast(t('אי אפשר להעתיק במכשיר הזה')); }
  };
  const wipePaid = async () => {
    if (!paidCount) { toast(t('אין רשומות ששולמו')); return; }
    if (!(await confirm({ icon: '🧹', title: t('מחיקה'), message: t('למחוק {n} רשומות ששולמו?', { n: paidCount }), okText: t('מחיקה'), cancelText: t('חזרה'), danger: true }))) return;
    clearPaid(); toast(t('נמחק'));
  };
  const wipeAll = async () => {
    if (!nb.entries.length) { toast(t('הפנקס כבר ריק')); return; }
    if (!(await confirm({ icon: '⚠️', title: t('מחיקה'), message: t('למחוק את כל הרשומות בפנקס? אי אפשר לבטל.'), okText: t('מחיקה'), cancelText: t('חזרה'), danger: true }))) return;
    clearAll(); toast(t('הפנקס התרוקן'));
  };

  return (
    <div className={'nb-page nb-settings' + (closing ? ' nb-pushed-out' : ' nb-pull-in')}>
      <div className="nb-head">
        <h1 className={closing ? 'nb-gear-spin-back' : undefined}><span className="nb-gear-ico"><UiIcon name="gear" inline /></span> {t('הגדרות')}</h1>
        <button className="ghost nb-gear" type="button" aria-label={t('חזרה')} onClick={onBack}><Arrow kind="left" /></button>
      </div>

      <section className="card nb-section">
        <h3>{t('מראה ונראות')}</h3>
        <LanguagePicker />
        <div className="field"><span>{t('עיצוב')}</span>
          <Opts value={s.look} options={looks()} label={t('עיצוב')} onPick={(v) => setSetting('look', v)} /></div>
        {s.look === 'neon' && (
          <div className="field"><span>{t('צבעי הניאון')}</span>
            <PalettePicker value={s.palette} onPick={(v) => setSetting('palette', v)} label={t('צבעי הניאון')} />
          </div>
        )}
        <div className="field"><span>{t('גודל הכתב')}</span>
          <Opts value={s.textSize} options={sizes()} label={t('גודל הכתב')} onPick={(v) => setSetting('textSize', v)} /></div>
      </section>

      <section className="card nb-section">
        <h3>{t('מטבע')}</h3>
        <div className="field"><span>{t('הסכומים בפנקס')}</span>
          <LocalePicker currencyOnly value={{ country: '', currency: cur }} onChange={(l) => setCurrencyChoice(l.currency)} /></div>
        <p className="hint">{t('שינוי המטבע משנה רק את הסימן. הסכומים עצמם לא מומרים.')}</p>
      </section>

      <section className="card nb-section">
        <h3>{t('הרשימה')}</h3>
        <div className="field"><span>{t('סדר הרישומים')}</span>
          <Select value={s.sort} onChange={(v) => setSetting('sort', v)} options={sorts()} /></div>
        <label className="check"><input type="checkbox" checked={s.showPaid} onChange={(e) => setSetting('showPaid', e.target.checked)} />
          <span>{t('להציג בעמוד הראשי גם את מה ששולם')}</span></label>
      </section>

      <section className="card nb-section">
        <h3>{t('הנתונים שלי')}</h3>
        <p className="hint">{t('הכול שמור רק במכשיר הזה.')}</p>
        <button className="ghost" type="button" onClick={copy}>{t('📋 העתקת הרשימה הפתוחה')}</button>
        <button className="ghost" type="button" onClick={wipePaid}>{t('🧹 מחיקת מה ששולם')}{paidCount ? ` (${paidCount})` : ''}</button>
        <button className="ghost danger" type="button" onClick={wipeAll}>{withIcons(t('🗑️ מחיקת כל הפנקס'))}</button>
      </section>

      <p className="legal"><a href="terms.html">{t('תנאי שימוש')}</a> · <a href="privacy.html">{t('מדיניות פרטיות')}</a></p>
    </div>
  );
}
