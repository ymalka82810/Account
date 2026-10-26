import { useEffect, useState } from 'react';
import { GoldBarArt, SumNum } from '../shared/GoldBar.jsx';
import { today, toast } from '../../lib/helpers.js';
import { money, fmtDate } from '../../lib/computations.js';
import { CURRENCIES, currencyLabel, currencySymbol } from '../../lib/currencies.js';
import {
  useNotebook, notebookCurrency, addEntry, setPaid, removeEntry, setSetting, setCurrencyChoice, clearPaid, clearAll,
} from '../../lib/notebook.js';
import { useSheet, useSheetTitle } from '../shared/Sheet.jsx';
import Select from '../shared/Select.jsx';
import { state } from '../../state/state.js';
import { closeNotebook } from '../../state/auth.js';
import { In } from '../auth/parts.jsx';

// הפנקס האישי: כל אחד (גם ילד/ה) רושם לעצמו למי הוא חייב ומי חייב לו.
// הכול נשמר במכשיר, בלי כניסה. זה מסך הפתיחה של מכשיר חדש. החיבור למשפחה עוד לא קיים.
// שני עמודים: ראשי (סיכום, כפתורי רישום, רשימה) והגדרות (מראה, מטבע, רשימה, נתונים).
// ההגדרות נפתחות עם #nb-settings בכתובת, כדי שכפתור "חזרה" של הטלפון יחזיר לעמוד הראשי.
const SETTINGS_HASH = '#nb-settings';
const pageFromHash = () => (location.hash === SETTINGS_HASH ? 'settings' : 'home');

export default function Notebook({ current }) {
  const nb = useNotebook();
  const [page, setPage] = useState(pageFromHash);

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
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { location.hash = SETTINGS_HASH; setPage('settings'); return; }
    setReturned(false);
    setPulling(true);
    setTimeout(() => { setPulling(false); location.hash = SETTINGS_HASH; setPage('settings'); }, 380);
  };
  // סגירה הפוכה מהפתיחה: הגלגל מסתובב לכיוון ההפוך ודוחף את ההגדרות החוצה לצד שלו,
  // והעמוד הראשי חוזר פנימה מהצד שאליו נדחף בפתיחה
  const [closing, setClosing] = useState(false);
  const [returned, setReturned] = useState(false);
  const leaveSettings = () => {
    if (location.hash === SETTINGS_HASH) history.back();
    else setPage('home');
  };
  const closeSettings = () => {
    if (closing) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { leaveSettings(); return; }
    setClosing(true);
    setTimeout(() => { setClosing(false); setReturned(true); leaveSettings(); }, 380);
  };

  return (
    <In screen="notebook" current={current}>
      {state.notebookBack && page === 'home' && <button className="ghost back" type="button" onClick={closeNotebook}>→ חזרה</button>}
      {page === 'home' ? <Home nb={nb} onSettings={openSettings} pulling={pulling} returned={returned} /> : <Settings nb={nb} onBack={closeSettings} closing={closing} />}
    </In>
  );
}

// ---------- עמוד ראשי ----------
function Home({ nb, onSettings, pulling, returned }) {
  const sheet = useSheet();
  const cur = notebookCurrency();
  const { sort, showPaid } = nb.settings;
  const sorted = (list) => [...list].sort((a, b) =>
    sort === 'amount' ? b.amount - a.amount
      : sort === 'name' ? a.name.localeCompare(b.name, 'he')
        : 0); // 'new': הרשימה כבר מהחדש לישן
  const open = sorted(nb.entries.filter((e) => !e.paid));
  const done = sorted(nb.entries.filter((e) => e.paid));
  const sum = (d) => open.filter((e) => e.dir === d).reduce((s, e) => s + e.amount, 0);

  const del = (e) => { if (window.confirm(`למחוק את הרישום של ${e.name}?`)) removeEntry(e.id); };
  const row = (e) => (
    <div className={'row' + (e.paid ? ' paid' : '')} key={e.id}>
      <div className="text">
        <strong>{e.name}</strong>
        <div className="meta">{e.dir === 'iowe' ? 'אני חייב' : 'חייב/ת לי'}{e.note ? ' • ' + e.note : ''} • {fmtDate(e.date)}</div>
      </div>
      <strong>{money(e.amount, cur)}</strong>
      <div className="acts">
        <button className="small" type="button" onClick={() => setPaid(e.id, !e.paid)}>{e.paid ? '↩️ עוד לא' : '✅ שולם'}</button>
        <button className="small" type="button" aria-label="מחיקה" onClick={() => del(e)}>🗑️</button>
      </div>
    </div>
  );

  return (
    <div className={'nb-page' + (pulling ? ' nb-pulled' : '') + (returned ? ' nb-push-back' : '')}>
      <div className="nb-head">
        <h1>📒 הפנקס שלי</h1>
        <button className={'ghost nb-gear' + (pulling ? ' nb-gear-spin' : '')} type="button" aria-label="הגדרות" onClick={onSettings}>
          <span className="nb-gear-ico">⚙️</span>
        </button>
      </div>

      <div className="summary">
        <div className="sum owe"><GoldBarArt /><div className="lbl">אני חייב</div><SumNum>{money(sum('iowe'), cur)}</SumNum></div>
        <div className="sum get"><GoldBarArt /><div className="lbl">חייבים לי</div><SumNum>{money(sum('owed'), cur)}</SumNum></div>
      </div>

      <div className="bigbtns">
        <button className="bigbtn owe" type="button" onClick={() => sheet.open('', <AddEntry initialDir="iowe" />)}>
          <span aria-hidden="true">💸</span>אני חייב כסף
        </button>
        <button className="bigbtn get" type="button" onClick={() => sheet.open('', <AddEntry initialDir="owed" />)}>
          <span aria-hidden="true">🤝</span>חייבים לי כסף
        </button>
      </div>

      <h2 className="nb-h2">מה פתוח</h2>
      {open.length > 0
        ? <div className="list">{open.map(row)}</div>
        : <div className="empty"><div className="big-emoji" aria-hidden="true">{nb.entries.length ? '🎉' : '📝'}</div>{nb.entries.length ? 'אין כלום פתוח!' : 'עוד אין כלום ברשימה. לחצו על אחד הכפתורים כדי להתחיל.'}</div>}

      {showPaid && done.length > 0 && (
        <details className="nb-paid">
          <summary>שולמו ({done.length})</summary>
          <div className="list">{done.map(row)}</div>
        </details>
      )}
    </div>
  );
}

// ---------- רישום חדש (חלון קופץ) ----------
function AddEntry({ initialDir }) {
  const sheet = useSheet();
  const [dir, setDir] = useState(initialDir);
  const [form, setForm] = useState({ name: '', amount: '', note: '' });
  const [error, setError] = useState('');
  useSheetTitle(dir === 'iowe' ? 'אני חייב כסף' : 'חייבים לי כסף');
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const submit = (ev) => {
    ev.preventDefault();
    const name = form.name.trim();
    const amount = Math.round(parseFloat(String(form.amount).replace(',', '.')) * 100);
    if (!name) { setError('כתבו את השם'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('כתבו סכום'); return; }
    if (amount > 1e9) { setError('הסכום גדול מדי'); return; }
    addEntry({ dir, name: name.slice(0, 30), amount, note: form.note.trim().slice(0, 60), date: today() });
    sheet.close();
  };

  return (
    <form className="form" autoComplete="off" onSubmit={submit}>
      <div className="nb-opts two">
        <button type="button" className={'ghost' + (dir === 'iowe' ? ' active' : '')} onClick={() => setDir('iowe')}>אני חייב</button>
        <button type="button" className={'ghost' + (dir === 'owed' ? ' active' : '')} onClick={() => setDir('owed')}>חייבים לי</button>
      </div>
      <label className="field"><span>{dir === 'iowe' ? 'למי?' : 'מי חייב לי?'}</span>
        <input type="text" maxLength={30} autoFocus value={form.name} onChange={set('name')} /></label>
      <label className="field"><span>כמה?</span>
        <span className="amt-field"><span className="amt-cur" aria-hidden="true">{currencySymbol(notebookCurrency())}</span>
          <input type="text" inputMode="decimal" dir="ltr" placeholder="0" value={form.amount} onChange={set('amount')} /></span></label>
      <label className="field"><span>על מה? (אפשר לדלג)</span>
        <input type="text" maxLength={60} value={form.note} onChange={set('note')} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit">רישום</button>
    </form>
  );
}

// ---------- הגדרות ----------
const LOOKS = [['kid', '🌈 צבעוני'], ['dark', '🌙 כהה'], ['neon', '⚡ ניאון']];
const PALETTES = [['blue', 'סגול ותכלת'], ['green', 'ירוק'], ['orange', 'כתום']];
const SIZES = [['small', 'קטן'], ['normal', 'רגיל'], ['large', 'גדול'], ['xlarge', 'ענק']];
const SORTS = [
  { value: 'new', label: 'הכי חדש קודם' },
  { value: 'amount', label: 'הסכום הגדול קודם' },
  { value: 'name', label: 'לפי שם (א-ב)' },
];
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c) }));

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
  const line = (e) => `${e.dir === 'iowe' ? 'אני חייב ל' : ''}${e.name}${e.dir === 'owed' ? ' חייב/ת לי' : ''}: ${money(e.amount, cur)}${e.note ? ` (${e.note})` : ''}`;
  const open = nb.entries.filter((e) => !e.paid);
  return open.length ? open.map(line).join('\n') : 'אין כלום פתוח';
}

function Settings({ nb, onBack, closing }) {
  const s = nb.settings;
  const cur = notebookCurrency();
  const paidCount = nb.entries.filter((e) => e.paid).length;

  const copy = async () => {
    try { await navigator.clipboard.writeText(listAsText(nb, cur)); toast('הרשימה הועתקה'); }
    catch (e) { toast('אי אפשר להעתיק במכשיר הזה'); }
  };
  const wipePaid = () => {
    if (!paidCount) { toast('אין רשומות ששולמו'); return; }
    if (window.confirm(`למחוק ${paidCount} רשומות ששולמו?`)) { clearPaid(); toast('נמחק'); }
  };
  const wipeAll = () => {
    if (!nb.entries.length) { toast('הפנקס כבר ריק'); return; }
    if (window.confirm('למחוק את כל הרשומות בפנקס? אי אפשר לבטל.')) { clearAll(); toast('הפנקס התרוקן'); }
  };

  return (
    <div className={'nb-page nb-settings' + (closing ? ' nb-pushed-out' : ' nb-pull-in')}>
      <div className="nb-head">
        <button className="ghost nb-gear" type="button" aria-label="חזרה" onClick={onBack}>→</button>
        <h1 className={closing ? 'nb-gear-spin-back' : undefined}><span className="nb-gear-ico">⚙️</span> הגדרות</h1>
      </div>

      <section className="card nb-section">
        <h3>מראה ונראות</h3>
        <div className="field"><span>עיצוב</span>
          <Opts value={s.look} options={LOOKS} label="עיצוב" onPick={(v) => setSetting('look', v)} /></div>
        {s.look === 'neon' && (
          <div className="field"><span>צבעי הניאון</span>
            <div className="palette-picks" role="radiogroup" aria-label="צבעי הניאון">
              {PALETTES.map(([id, text]) => (
                <button key={id} type="button" role="radio" aria-checked={s.palette === id}
                  className={'palette-pick' + (s.palette === id ? ' sel' : '')} data-pal={id} onClick={() => setSetting('palette', id)}>
                  <span className="palette-swatch" aria-hidden="true" />{text}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field"><span>גודל הכתב</span>
          <Opts value={s.textSize} options={SIZES} label="גודל הכתב" onPick={(v) => setSetting('textSize', v)} /></div>
      </section>

      <section className="card nb-section">
        <h3>מטבע</h3>
        <div className="field"><span>הסכומים בפנקס</span>
          <Select value={cur} onChange={setCurrencyChoice} options={CURRENCY_OPTIONS} /></div>
        <p className="hint">שינוי המטבע משנה רק את הסימן. הסכומים עצמם לא מומרים.</p>
      </section>

      <section className="card nb-section">
        <h3>הרשימה</h3>
        <div className="field"><span>סדר הרישומים</span>
          <Select value={s.sort} onChange={(v) => setSetting('sort', v)} options={SORTS} /></div>
        <label className="check"><input type="checkbox" checked={s.showPaid} onChange={(e) => setSetting('showPaid', e.target.checked)} />
          <span>להציג בעמוד הראשי גם את מה ששולם</span></label>
      </section>

      <section className="card nb-section">
        <h3>הנתונים שלי</h3>
        <p className="hint">הכול שמור רק במכשיר הזה.</p>
        <button className="ghost" type="button" onClick={copy}>📋 העתקת הרשימה הפתוחה</button>
        <button className="ghost" type="button" onClick={wipePaid}>🧹 מחיקת מה ששולם{paidCount ? ` (${paidCount})` : ''}</button>
        <button className="ghost danger" type="button" onClick={wipeAll}>🗑️ מחיקת כל הפנקס</button>
      </section>

      <p className="legal"><a href="terms.html">תנאי שימוש</a> · <a href="privacy.html">מדיניות פרטיות</a></p>
    </div>
  );
}
