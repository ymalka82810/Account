import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { state, LAST_ROLE_KEY, LAST_PALETTE_KEY, THEME_COLOR, tabLabels, subscribeAuth, authVersion, bumpAuth } from './state/state.js';
import { t } from './i18n/index.js';
import { call, callAction, useQuery } from './lib/api.js';
import { toast, errMsg } from './lib/helpers.js';
import { restoreFamily, startPin, autoSkipPerson, dropSession, endDemo, deviceHasFamily, openNotebookOffline } from './state/auth.js';
import { syncPush } from './lib/push.js';
import { client } from './lib/client.js';
import { isDemo } from './lib/demo.js';
import { upsertMembership, forgetMembershipByToken, syncTargets } from './lib/memberships.js';
import { getCards, upsertCard } from './lib/cards.js';
import { isPending, setFx } from './lib/computations.js';
import { applyAppIcon, deviceCurrency } from './lib/appIcon.js';
import { AppCtx, useApp } from './state/appContext.js';
import { useNotebook, TEXT_SCALE, NB_SHARED_KEY } from './lib/notebook.js';
import { useSheet } from './components/shared/Sheet.jsx';
import { EntryFlow } from './components/entries/EntryFlow.jsx';
import { AccountSheet } from './components/account/AccountSheet.jsx';
import Auth from './components/auth/Auth.jsx';
import Home from './components/home/Home.jsx';
import FriendsTab from './components/friends/FriendsTab.jsx';
import FamilyTab from './components/family/FamilyTab.jsx';
import ManageTab from './components/manage/ManageTab.jsx';
import HistoryTab from './components/history/HistoryTab.jsx';
import LocaleSheet from './components/manage/LocaleSheet.jsx';
import FamilyWelcome from './components/manage/FamilyWelcome.jsx';
import DeviceGate from './components/account/DeviceGate.jsx';
import PendingMoves from './components/account/PendingMoves.jsx';
import UiIcon, { withIcons } from './components/shared/UiIcon.jsx';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import NoConnection from './components/shared/NoConnection.jsx';
import { reducedMotion } from './lib/feel.js';

const ICON_CURRENCY_KEY = 'app-icon-currency';

// ---------- איזה מסך מוצג ----------
// loading | noserver | welcome | setup | login | join | pin | notebook | app
function currentScreen(data) {
  if (!client) return 'noserver';
  // הפנקס האישי עובד במכשיר בלבד, בלי כניסה, ולכן לא מחכים לשרת.
  // מי שיש לו כניסה שמורה ופתח אותו ממסך "אין חיבור" (offlineNotebook) נשאר בו גם כשהשרת חוזר, עד שיחזור משם.
  if ((!state.token || state.offlineNotebook) && state.view === 'notebook') return 'notebook';
  if (state.token) return data && !data.legacy ? 'app' : 'loading';
  if (state.legacyPeople === null || !state.codeChecked) return 'loading';
  if (state.pinFlow) return 'pin';
  if (state.view === 'setup') return 'setup';
  if (state.view === 'join' && state.fam) return 'join';
  if (state.fam) return autoSkipPerson() ? 'pin' : 'login';
  return 'welcome';
}

function applyTheme(role, palette) {
  if (role) document.body.dataset.theme = role; else delete document.body.dataset.theme;
  if (role === 'teen' && palette) document.body.dataset.palette = palette; else delete document.body.dataset.palette;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', THEME_COLOR[role] || THEME_COLOR.child);
}

// ---------- ערכת הנושא של מסך הטעינה ----------
// המעבר (כניסה או יציאה) צריך להיראות כמו המסכים של מי שנכנס/יצא: רקע ההורה
// להורה, רקע הנוער לנוער. מי זה? לפי הסדר: מי שבאמצע הזנת הקוד הסודי, מי
// שהמכשיר מדלג אליו, ואחרת מי שנכנס לאחרונה מהמכשיר הזה (גם ביציאה).
function loadingTheme() {
  const person = (state.pinFlow && state.pinFlow.person) || (!state.token && autoSkipPerson()) || null;
  const role = (person && person.role) || localStorage.getItem(LAST_ROLE_KEY) || '';
  if (role !== 'parent' && role !== 'teen' && role !== 'child') return { role: '', palette: '' };
  return { role, palette: role === 'teen' ? localStorage.getItem(LAST_PALETTE_KEY) || '' : '' };
}

const TAB_IDS = ['home', 'friends', 'history', 'family', 'manage'];
const tabFromHash = () => { const h = location.hash.slice(1); return TAB_IDS.includes(h) ? h : null; };

const defaultLabels = () => ({ home: t('💰 הכסף שלי'), friends: t('🤝 חברים'), history: t('📜 מה היה'), family: t('👨‍👩‍👧 המשפחה'), manage: t('ניהול') });

// משך האנימציה של מסך הטעינה (coin-drop-cycle ב-style.css) - מסך הטעינה
// נשאר מוצג לפחות עד שקטע אנימציה שלם אחד מסתיים, גם אם הטעינה עצמה הסתיימה קודם.
// האנימציה המלאה היא בונוס חד-פעמי: רק בפעם הראשונה במכשיר. אחר כך המסך נעלם ברגע שהנתונים הגיעו.
const LOADING_MIN_MS = 4500;
const LOADING_SEEN_KEY = 'loadingAnimSeen';
const loadingMinMs = () => {
  try {
    if (localStorage.getItem(LOADING_SEEN_KEY)) return 0;
    localStorage.setItem(LOADING_SEEN_KEY, '1');
  } catch (e) { /* */ }
  return LOADING_MIN_MS;
};

// טקסטים שמתחלפים במסך הטעינה, לפי מה שבאמת קורה (כניסה או יציאה).
// כמה זמן מחכים לשרת לפני שמראים "אין חיבור". בפיתוח (vite) בדיקות יכולות לקצר דרך window.__kupaStallMs.
const STALL_MS = 6000;
const stallMs = () => (import.meta.env.DEV && typeof window.__kupaStallMs === 'number' ? window.__kupaStallMs : STALL_MS);

const loginTexts = () => [t('רגע, מתחברים…'), t('בודקים מי זה…'), t('כבר כמעט…')];
const logoutTexts = () => [t('רגע, מתנתקים…'), t('שומרים הכל…'), t('יוצאים בבטחה…')];

function LoadingText({ active, texts }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    setI(0);
    const id = setInterval(() => setI((n) => (n + 1) % texts.length), 1500);
    return () => clearInterval(id);
  }, [active, texts]);
  return <p>{texts[i]}</p>;
}

export default function App() {
  if (!client) {
    return (
      <section id="screen-noserver" className="screen center active">
        <div className="big-emoji" aria-hidden="true">🔌</div>
        <h1>{t('האפליקציה עוד לא מחוברת לשרת')}</h1>
        <p className="hint">{t('הורה צריך להגדיר את כתובת Convex בקובץ')} <code>config.js</code>.</p>
      </section>
    );
  }
  return <Root />;
}

function Root() {
  useSyncExternalStore(subscribeAuth, authVersion);
  const nb = useNotebook();
  const sheet = useSheet();
  const token = state.token;
  const data = useQuery('data:get', token ? { token } : 'skip');
  const fdata = useQuery('friends:get', token ? { token } : 'skip') || null;
  // "ניסיון חוזר" במסך "אין חיבור" מבטל את ההרשמה לרשימה לרגע ומחדש אותה (שרת שחזר מתחבר גם לבד).
  const [rosterPause, setRosterPause] = useState(false);
  const roster = useQuery('auth:legacyRoster', rosterPause ? 'skip' : {});
  // שערי חליפין (לחובות במטבע אחר). אם אין או שהם ישנים, מבקשים מהשרת לעדכן.
  const fx = useQuery('fx:rates', token ? {} : 'skip');
  // אם העדכון נכשל (אין חיבור, או הספק למטה) מודיעים למשתמש ומנסים שוב כל חצי דקה, עד שזה מצליח.
  const [fxRetry, setFxRetry] = useState(0);
  useEffect(() => {
    if (fx === undefined) return;
    if (fx && Date.now() - fx.fetchedAt <= 6 * 60 * 60 * 1000) return;
    let timer;
    callAction('fx:ensure', {}).catch((e) => {
      toast(errMsg(e));
      timer = setTimeout(() => setFxRetry((n) => n + 1), 30000);
    });
    return () => clearTimeout(timer);
  }, [fx, fxRetry]);
  const [tabSel, setTabSel] = useState(tabFromHash);
  const migrating = useRef(false);
  const firstToken = useRef(true);

  // רשימת ההורים מהגרסה הישנה. אם מישהו באמצע כניסה כזו, מרעננים אותו.
  useEffect(() => {
    if (roster === undefined) return;
    state.legacyPeople = roster;
    const f = state.pinFlow;
    if (f && f.legacy) {
      const fresh = roster.find((p) => p.id === f.person.id);
      if (!fresh) state.pinFlow = null;
      else { f.person = fresh; if (!fresh.hasPin && f.mode === 'login') f.mode = 'new'; }
    }
    bumpAuth();
  }, [roster]);

  // קוד המשפחה שמור במכשיר.
  useEffect(() => { restoreFamily().finally(() => { state.codeChecked = true; bumpAuth(); }); }, []);

  // כניסה לא תקפה, או חשבון מהגרסה הישנה (בלי משפחה).
  useEffect(() => {
    if (!token || data === undefined) return;
    if (data === null) { dropSession(); return; }
    if (!data.legacy || migrating.current) return;
    if (!data.canMigrate) { toast(t('צריך להיכנס מחדש עם קוד המשפחה')); dropSession(); return; }
    migrating.current = true;
    call('auth:migrateMe', { token }).catch(() => dropSession()).finally(() => { migrating.current = false; });
  }, [token, data]);

  const rawScreen = currentScreen(data);
  const [shownScreen, setScreen] = useState(rawScreen);
  // יציאה מהאפליקציה מוצגת מיד: בלי הנתונים אי אפשר לרנדר את המסך הראשי אפילו פעם אחת.
  const screen = shownScreen === 'app' && rawScreen !== 'app' ? rawScreen : shownScreen;
  // טעינה שנמשכת יותר מדי (שרת לא זמין): מסך "אין חיבור". בלי תשובה מהשרת לא מניחים שאין הורים ישנים,
  // ולכן ממשיכים לחכות; ברגע שהמצב משתנה (החיבור חזר) המסך נעלם והאפליקציה ממשיכה רגיל.
  const [stalled, setStalled] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (rawScreen !== 'loading') { setStalled(false); return undefined; }
    const timer = setTimeout(() => setStalled(true), stallMs());
    return () => clearTimeout(timer);
  }, [rawScreen, retryTick]);
  useEffect(() => {
    if (!rosterPause) return undefined;
    const timer = setTimeout(() => setRosterPause(false), 50);
    return () => clearTimeout(timer);
  }, [rosterPause]);
  const retryConnection = () => { setStalled(false); setRosterPause(true); setRetryTick((n) => n + 1); };
  const offline = stalled && rawScreen === 'loading';
  const loadingSince = useRef(rawScreen === 'loading' ? Date.now() : null);
  const minMs = useRef(null);
  if (minMs.current == null) minMs.current = loadingMinMs();
  useEffect(() => {
    if (rawScreen === 'loading') {
      if (loadingSince.current == null) loadingSince.current = Date.now();
      setScreen('loading');
      return;
    }
    if (loadingSince.current == null) { setScreen(rawScreen); return; }
    const remain = minMs.current - (Date.now() - loadingSince.current);
    if (remain <= 0) { loadingSince.current = null; setScreen(rawScreen); state.exiting = false; return; }
    const timer = setTimeout(() => { loadingSince.current = null; setScreen(rawScreen); state.exiting = false; }, remain);
    return () => clearTimeout(timer);
  }, [rawScreen]);

  // דילוג ישר לקוד הסודי כשברור מי נכנס.
  useEffect(() => {
    if (state.token || state.legacyPeople === null || !state.codeChecked || state.pinFlow) return;
    if (state.view === 'setup' || state.view === 'notebook' || (state.view === 'join' && state.fam) || !state.fam) return;
    const skip = autoSkipPerson();
    if (skip) startPin(skip, false);
  });

  // כניסה או יציאה: סוגרים חלונות, ובכל כניסה מתחילים מהלשונית הראשית.
  useEffect(() => {
    sheet.close();
    // בטעינה ראשונה עם כניסה שמורה נשארים בלשונית מהכתובת.
    if (firstToken.current && token) { firstToken.current = false; return; }
    firstToken.current = false;
    setTabSel(null);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // כפתור "חזרה" בדפדפן מחזיר ללשונית הקודמת.
  useEffect(() => {
    const onPop = () => setTabSel(tabFromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const role = screen === 'app' ? data.me.role : '';
  const palette = screen === 'app' ? data.me.palette : '';
  // במסך הטעינה מחילים את ערכת הנושא של מי שנכנס או יצא, כדי שהמעבר ייראה
  // כמו המשך של שאר המסכים שלו ולא כמו מסך של ילדים.
  const lt = screen === 'loading' ? loadingTheme() : null;
  // הפנקס האישי: המראה לפי ההגדרות שלו (צבעוני = בלי ערכת נושא, כהה = של הורים, ניאון = של נוער)
  const nbLook = screen === 'notebook' ? nb.settings.look : '';
  const nbRole = nbLook === 'dark' ? 'parent' : nbLook === 'neon' ? 'teen' : '';
  const themeRole = screen === 'app' ? role : screen === 'notebook' ? nbRole : (lt ? lt.role : '');
  const themePalette = screen === 'app' ? palette : screen === 'notebook' ? (nbRole === 'teen' ? nb.settings.palette : '') : (lt ? lt.palette : '');
  // גודל הכתב של הפנקס (רק בו)
  const nbScale = screen === 'notebook' ? (TEXT_SCALE[nb.settings.textSize] || 100) : 100;
  useEffect(() => {
    document.documentElement.style.fontSize = nbScale === 100 ? '' : nbScale + '%';
    return () => { document.documentElement.style.fontSize = ''; };
  }, [nbScale]);
  useEffect(() => { applyTheme(themeRole, themePalette); }, [themeRole, themePalette]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen]);
  // הורה במשפחה שעוד לא בחרה איפה היא גרה: שואלים פעם אחת בכל כניסה
  const askedLocale = useRef(false);
  const needLocale = screen === 'app' && data.me.role === 'parent' && !data.family.localeSet;
  useEffect(() => {
    if (!needLocale || askedLocale.current) return;
    askedLocale.current = true;
    sheet.open(t('איפה אתם גרים?'), <LocaleSheet token={token} />);
  }, [needLocale]); // eslint-disable-line react-hooks/exhaustive-deps
  // משפחה שנפתחה הרגע: מציעים מיד להוסיף בני משפחה (ולא משאירים להורה לחפש איפה עושים את זה)
  const welcomeReady = screen === 'app' && data.me.role === 'parent' && data.family.localeSet && state.justCreatedFamily;
  useEffect(() => {
    if (!welcomeReady) return;
    state.justCreatedFamily = false;
    sheet.open(t('מי הילדים שלך?'), <FamilyWelcome />);
  }, [welcomeReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // אייקון לפי המטבע: של המשפחה אחרי כניסה, אם הוגדר לה מיקום (ונשמר לפעם הבאה). אחרת האחרון שנשמר,
  // או לפי המיקום של המכשיר, ואם גם הוא לא ידוע - דולר.
  const familyCurrency = screen === 'app' && data.family.localeSet ? data.family.currency : '';
  useEffect(() => {
    let cur = familyCurrency;
    if (cur) { try { localStorage.setItem(ICON_CURRENCY_KEY, cur); } catch (e) { /* */ } }
    else { try { cur = localStorage.getItem(ICON_CURRENCY_KEY); } catch (e) { /* */ } }
    applyAppIcon(cur || deviceCurrency() || 'USD');
  }, [familyCurrency]);
  useEffect(() => {
    if (screen !== 'app') return;
    localStorage.setItem(LAST_ROLE_KEY, role);
    if (role === 'teen') localStorage.setItem(LAST_PALETTE_KEY, palette || '');
    syncPush();
  }, [screen, role, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const isParent = role === 'parent';
  const isTeen = role === 'teen';
  const setTab = useCallback((tabId) => {
    setTabSel(tabId);
    if (location.hash !== '#' + tabId) history.pushState(null, '', '#' + tabId);
    window.scrollTo({ top: 0 });
  }, []);
  const openEntryFlow = useCallback((opts) => sheet.open('', <EntryFlow opts={opts} />), [sheet]);

  // המטבע הראשי והשערים נקבעים לפני שהמסכים מצוירים (חישובי היתרות משתמשים בהם).
  if (screen === 'app') setFx(data.family.currency, fx && fx.rates);
  const ctx = useMemo(() => (screen === 'app'
    ? { data, fdata, token, me: data.me.id, isParent, setTab, openEntryFlow, fx }
    : null), [screen, data, fdata, token, isParent, setTab, openEntryFlow, fx]);

  useEffect(() => { sheet.setAppCtx(ctx); }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // המשפחה הנוכחית נרשמת ברשימת המשפחות של המכשיר (ילד/ה בהורים גרושים מחובר/ת לשתיים).
  const shareNb = screen === 'app' && !!data.me.notebookShared && !data.me.notebookPaused && !isDemo(token);
  // חידוש שיתוף במשפחה אחרת (מסך "מי רואה את הפנקס שלי") מבקש שליחה מיידית של העותק.
  const [resyncTick, setResyncTick] = useState(0);
  useEffect(() => {
    const on = () => setResyncTick((n) => n + 1);
    window.addEventListener('kupa-nb-resync', on);
    return () => window.removeEventListener('kupa-nb-resync', on);
  }, []);
  // הצפייה של ההורים בפנקס הסתיימה (שינוי תפקיד): הודעה אחת, והפנקס נשאר במכשיר.
  const shareEnded = screen === 'app' && !!data.me.notebookShareEnded && !isDemo(token);
  useEffect(() => {
    if (!shareEnded) return;
    toast(t('ההורים כבר לא רואים את הפנקס האישי שלך. הוא נשאר רק אצלך.'));
    call('notebook:ackEnded', { token }).catch(() => {});
  }, [shareEnded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (screen !== 'app' || isDemo(token)) return;
    upsertMembership({
      personId: data.me.id, token, familyId: data.family.id, familyName: data.family.name, name: data.me.name,
      avatar: data.me.avatar || '', role: data.me.role, shared: !!data.me.notebookShared && !data.me.notebookPaused,
    });
  }, [screen, token, data]); // eslint-disable-line react-hooks/exhaustive-deps
  // כל משפחה שהמכשיר מחובר אליה מקבלת כרטיס כניסה שנשאר במכשיר, כדי שהמעבר אליה (גם אחרי יציאה) לא יבקש את קוד המשפחה.
  const famId = screen === 'app' ? data.family.id : '';
  const famName = screen === 'app' ? data.family.name : '';
  useEffect(() => {
    if (!famId || isDemo(token) || getCards().some((c) => c.familyId === famId)) return;
    call('auth:deviceCard', { token }).then((r) => {
      if (r && r.ok && r.loginCode) upsertCard({ familyId: String(r.familyId), name: r.familyName || famName, card: r.loginCode });
    }).catch(() => {});
  }, [famId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (screen !== 'app') return;
    try { if (shareNb) localStorage.setItem(NB_SHARED_KEY, '1'); else localStorage.removeItem(NB_SHARED_KEY); } catch (e) { /* מצב פרטי */ }
  }, [shareNb, screen]);
  // צפייה חיה: אחרי כל שינוי בפנקס (בהשהיה קצרה) נשלח עותק לכל משפחה שהילד/ה אישר/ה בה, לצפייה בלבד.
  // כל משפחה מקבלת עותק נפרד דרך הטוקן שלה, וגם כשהמכשיר מחובר כרגע רק לאחת מהן.
  useEffect(() => {
    if (isDemo(token)) return undefined;
    const id = setTimeout(() => {
      const payload = JSON.stringify({ entries: nb.entries, currency: nb.currency });
      for (const m of syncTargets()) {
        client.mutation(/** @type {any} */ ('notebook:sync'), { token: m.token, data: payload }).catch((e) => {
          // הכניסה למשפחה הזאת פגה: מוותרים עליה עד שהילד/ה ייכנס/תיכנס אליה שוב.
          if (errMsg(e).includes('צריך להיכנס מחדש')) forgetMembershipByToken(m.token);
        });
      }
    }, 1500);
    return () => clearTimeout(id);
  }, [token, shareNb, nb.entries, nb.currency, resyncTick]);
  // קיצור "רשום חוב" ממסך הבית של הטלפון (shortcuts ב-manifest.webmanifest): ?add=debt.
  // ממתינים עד שהמשתמש/ת בתוך האפליקציה (אחרי קוד סודי), פותחים את אשף החוב פעם אחת ומנקים את הכתובת.
  useEffect(() => {
    if (screen !== 'app') return;
    const params = new URLSearchParams(location.search);
    if (params.get('add') !== 'debt') return;
    params.delete('add');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    setTabSel('home');
    openEntryFlow({ kind: 'debt', from: data.me.id });
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {offline && <NoConnection onRetry={retryConnection} onNotebook={openNotebookOffline} />}
      <section id="screen-loading" className={'screen center' + (screen === 'loading' && !offline ? ' active' : '')}>
        <div className="coin-drop" aria-hidden="true">
          <div className="coin-drop__mask">
            <div className="coin-drop__coin"><img src="coin.webp" alt="" width="56" height="56" draggable="false" /></div>
          </div>
          <div className="coin-drop__floor" />
        </div>
        <LoadingText active={screen === 'loading'} texts={state.exiting ? logoutTexts() : loginTexts()} />
      </section>
      <Auth current={screen} />
      <section id="screen-app" className={'screen' + (screen === 'app' ? ' active' : '')}>
        {ctx && (
          <AppCtx.Provider value={ctx}>
            <Shell tabSel={tabSel} setTab={setTab} isParent={isParent} isTeen={isTeen} />
          </AppCtx.Provider>
        )}
      </section>
    </>
  );
}

// ---------- אנימציית מעבר גלגל השיניים לאריח הצף (ילד ונוער בלבד) ----------
// גלגל השיניים קופץ ממקומו למרכז המסך, מסתובב וגדל (0.14 שנ'). אז מבזיקים ניצוצות והוא שוקע לאחור
// ונעלם (0.12 שנ'), ובתחילת השקיעה האריח האמיתי נפתח וגדל מאותה נקודה (0.18 שנ') והניצוצות עפים (0.22 שנ'). בסך הכול כ-0.4 שנ'.
// הזמנים כאן ו-.gear-launch ב-style.css חייבים להישאר זהים.
const COIN_SIZE = 192; // הגודל הסופי של גלגל השיניים לפני השקיעה
function GearLaunch({ fromRect, onSinking, onDone }) {
  const [phase, setPhase] = useState('start'); // start -> flying -> sinking
  // onDone ב-ref כדי שרינדור מחדש של ההורה לא יאפס את הטיימר של הסיום
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onSinkingRef = useRef(onSinking);
  onSinkingRef.current = onSinking;

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase('flying'));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (phase !== 'flying') return;
    const t = setTimeout(() => setPhase('sinking'), 140); // קפיצה וגדילה במקביל
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'sinking') return;
    onSinkingRef.current();
    const t = setTimeout(() => onDoneRef.current(), 120);
    return () => clearTimeout(t);
  }, [phase]);

  const style = phase === 'start'
    ? { left: fromRect.left + fromRect.width / 2, top: fromRect.top + fromRect.height / 2, width: fromRect.width, height: fromRect.height }
    : phase === 'flying'
      ? { left: '50%', top: '50%', width: COIN_SIZE, height: COIN_SIZE }
      : { left: '50%', top: '50%', width: 0, height: 0, opacity: 0 };

  return (
    <>
      <div className={'gear-launch' + (phase === 'sinking' ? ' sinking' : '')} style={style} aria-hidden="true">
        <div className={'gear-launch-spin' + (phase === 'flying' ? ' flying' : '') + (phase === 'sinking' ? ' sinking' : '')}>
          <span className="gear-launch-icon"><UiIcon name="gear" /></span>
        </div>
      </div>
    </>
  );
}

// הניצוצות בשכבה נפרדת מהגלגל (לא מסתובבים ולא נעלמים איתו), וממשיכים לעוף
// ולדהות גם אחרי שהגלגל נעלם ואחרי שהאריח נפתח, עד שהם יוצאים מהמסך (לא חוסמים קלט).
const SPARKS_MS = 220;
function GearSparks({ onEnd }) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), SPARKS_MS + 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="gear-sparks" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className={'spark' + (i % 2 ? ' spark--short' : '')} style={{ '--ang': `${i * (360 / 14)}deg`, animationDelay: `${(i % 3) * 15}ms` }} />
      ))}
    </div>
  );
}

// זורק שגיאת רינדור בלשונית כש-window.__kupaCrash שווה לה. קיים רק בפיתוח (vite), ונמחק מבניית הייצור; לבדיקות ה-e2e של ErrorBoundary.
function CrashProbe({ tab }) {
  if (import.meta.env.DEV && window.__kupaCrash === tab) throw new Error('בדיקה: שגיאת רינדור בלשונית ' + tab);
  return null;
}

// ---------- המסך הראשי ----------
function Shell({ tabSel, setTab, isParent, isTeen }) {
  const { data, fdata, token, me } = useApp();
  const role = data.me.role;
  // הלשונית הנבחרת: ברירת מחדל לפי תפקיד, ואם היא לא שייכת לתפקיד חוזרים לבית.
  let tab = tabSel || (isParent ? 'family' : 'home');
  if (((tab === 'family' || tab === 'manage') && !isParent) || (tab === 'friends' && !isTeen)) tab = 'home';

  const allLabels = tabLabels();
  const labels = allLabels[role] || allLabels.child;
  const fallbackLabels = defaultLabels();
  const friendReqs = data.people.filter((p) => p.friendsRequested).length;
  const parentCount = data.entries.filter(isPending).length + friendReqs;
  const friendsCount = fdata && fdata.kind === 'teen' && fdata.enabled
    ? fdata.friendships.filter((f) => f.status === 'pending' && f.incoming).length
      + fdata.entries.filter((e) => isPending(e) && e.createdBy !== me).length
    : 0;

  const tabs = ['home', ...(isTeen ? ['friends'] : []), 'history', ...(isParent ? ['family', 'manage'] : [])];
  const myPending = isParent ? 0 : data.entries.filter((e) => isPending(e) && (e.from === me || e.to === me)).length;
  const badge = { home: myPending, family: isParent ? parentCount : 0, friends: friendsCount };

  const sheet = useSheet();
  const gearRef = useRef(null);
  const tabsRef = useRef(null);
  const [launchRect, setLaunchRect] = useState(null);
  // הורה שהמכשיר שלו עוד לא קשור (ראו biometric.ts) לא ממשיך לפני הקישור.
  const dev = useQuery('biometric:deviceStatus', isParent && !isDemo(token) ? { token } : 'skip');

  // ברירת מחדל: החלון עולה בקלילות (Sheet.jsx). האפקט עם הגלגל והניצוצות רק לילד ולנוער, ולא בהפחתת תנועה.
  const openAccount = () => {
    if (launchRect) return;
    if (isParent || reducedMotion() || !gearRef.current) sheet.open('', <AccountSheet />);
    else setLaunchRect(gearRef.current.getBoundingClientRect());
  };
  const [sparksOn, setSparksOn] = useState(false);
  // החלון נפתח כבר בתחילת השקיעה (ולא אחרי סיום האפקט), כך שהאפקט לא מעכב ולא חוסם.
  const sinkLaunch = useCallback(() => {
    setSparksOn(true);
    sheet.open('', <AccountSheet />, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }, [sheet]);
  const finishLaunch = useCallback(() => setLaunchRect(null), []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--tabs-h', el.offsetHeight + 'px');
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [tabs.length, isParent, dev && dev.bound]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isParent && dev && !dev.bound) return <DeviceGate />;

  return (
    <>
      {isParent && !isDemo(token) && <PendingMoves />}
      {isDemo(token) && (
        <div className="demo-banner" role="status">
          <span>{t('👀 מצב דמו: נתוני דוגמה, שום דבר לא נשמר')}</span>
          <span className="demo-cta">
            <button type="button" className="primary" onClick={() => endDemo('notebook')}>{t('רשמו חוב משלכם בפנקס')}</button>
            {!deviceHasFamily() && <button type="button" onClick={() => endDemo('setup')}>{t('הקימו קופה למשפחה')}</button>}
            <button type="button" onClick={() => { state.exiting = true; dropSession(); }}>{t('יציאה מהדמו')}</button>
          </span>
        </div>
      )}
      <header className="top">
        <div className="who-am-i">
          {data.me.avatar && <span className="avatar-sm" aria-hidden="true">{data.me.avatar}</span>}
          <div>
            <h1>{data.me.name} {data.family.name.replace(/^משפחת\s+/, '')}</h1>
          </div>
        </div>
        <button className="ghost light" type="button" aria-label={t('החשבון שלי')} onClick={openAccount}>
          {/* בזמן האנימציה הגלגל "יוצא" מהכפתור, אז המקום שלו מתכווץ והטקסט נשאר לבד */}
          <span ref={gearRef} aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'bottom', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'max-width .15s ease, opacity .1s ease, margin .15s ease', ...(launchRect ? { maxWidth: 0, opacity: 0, marginInlineStart: '-.3em' } : { maxWidth: '2em' }) }}><UiIcon name="gear" inline /></span> {t('החשבון שלי')}
        </button>
      </header>
      {launchRect && <GearLaunch fromRect={launchRect} onSinking={sinkLaunch} onDone={finishLaunch} />}
      {sparksOn && <GearSparks onEnd={() => setSparksOn(false)} />}

      <nav className="tabs" ref={tabsRef} role="tablist" aria-label={t('תפריט ראשי')}>
        {tabs.map((id) => (
          <button key={id} id={'tabbtn-' + id} role="tab" aria-controls={'tab-' + id} data-tab={id} className={'tab' + (tab === id ? ' active' : '')} aria-selected={tab === id} onClick={() => setTab(id)}>
            {withIcons(labels[id] || fallbackLabels[id])}
            {badge[id] ? <span className="badge">{badge[id]}</span> : null}
          </button>
        ))}
      </nav>

      <main>
        <section id="tab-home" role="tabpanel" aria-labelledby="tabbtn-home" className={'panel' + (tab === 'home' ? ' active' : '')}>
          <ErrorBoundary><CrashProbe tab="home" /><Home data={data} token={token} /></ErrorBoundary>
        </section>
        {isTeen && (
          <section id="tab-friends" role="tabpanel" aria-labelledby="tabbtn-friends" className={'panel' + (tab === 'friends' ? ' active' : '')}>
            <ErrorBoundary><CrashProbe tab="friends" /><FriendsTab data={data} fdata={fdata} token={token} /></ErrorBoundary>
          </section>
        )}
        <section id="tab-history" role="tabpanel" aria-labelledby="tabbtn-history" className={'panel' + (tab === 'history' ? ' active' : '')}>
          <ErrorBoundary><CrashProbe tab="history" /><HistoryTab data={data} token={token} me={me} isParent={isParent} /></ErrorBoundary>
        </section>
        {isParent && (
          <section id="tab-family" role="tabpanel" aria-labelledby="tabbtn-family" className={'panel' + (tab === 'family' ? ' active' : '')}>
            <ErrorBoundary><CrashProbe tab="family" /><FamilyTab data={data} fdata={fdata} token={token} /></ErrorBoundary>
          </section>
        )}
        {isParent && (
          <section id="tab-manage" role="tabpanel" aria-labelledby="tabbtn-manage" className={'panel' + (tab === 'manage' ? ' active' : '')}>
            <ErrorBoundary><CrashProbe tab="manage" /><ManageTab data={data} token={token} /></ErrorBoundary>
          </section>
        )}
      </main>
    </>
  );
}
