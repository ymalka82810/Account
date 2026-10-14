import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { state, CODE_KEY, THEME_COLOR, TAB_LABELS, subscribeAuth, authVersion, bumpAuth } from './state/state.js';
import { call } from './lib/api.js';
import { toast } from './lib/helpers.js';
import { restoreFamily, startPin, autoSkipPerson, dropSession } from './state/auth.js';
import { syncPush } from './lib/push.js';
import { client } from './lib/client.js';
import { isPending } from './lib/computations.js';
import { AppCtx, useApp } from './state/appContext.js';
import { useSheet } from './components/shared/Sheet.jsx';
import { EntryFlow } from './components/entries/EntryFlow.jsx';
import { AccountSheet } from './components/account/AccountSheet.jsx';
import Auth from './components/auth/Auth.jsx';
import Home from './components/home/Home.jsx';
import FriendsTab from './components/friends/FriendsTab.jsx';
import FamilyTab from './components/family/FamilyTab.jsx';
import ManageTab from './components/manage/ManageTab.jsx';
import HistoryTab from './components/history/HistoryTab.jsx';

// ---------- איזה מסך מוצג ----------
// loading | noserver | welcome | setup | login | join | pin | app
function currentScreen(data) {
  if (!client) return 'noserver';
  if (state.token) return data && !data.legacy ? 'app' : 'loading';
  if (state.legacyPeople === null || !state.codeChecked) return 'loading';
  if (state.pinFlow) return 'pin';
  if (state.view === 'setup') return 'setup';
  if (state.view === 'join' && state.fam) return 'join';
  if (state.fam) return autoSkipPerson() ? 'pin' : 'login';
  return 'welcome';
}

function applyTheme(role) {
  if (role) document.body.dataset.theme = role; else delete document.body.dataset.theme;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', THEME_COLOR[role] || THEME_COLOR.child);
}

const TAB_IDS = ['home', 'friends', 'history', 'family', 'manage'];
const tabFromHash = () => { const h = location.hash.slice(1); return TAB_IDS.includes(h) ? h : null; };

const DEFAULT_LABELS = { home: '💰 הכסף שלי', friends: '🤝 חברים', history: '📜 מה היה', family: '👨‍👩‍👧 המשפחה', manage: 'ניהול' };

// משך האנימציה של מסך הטעינה (coin-drop-cycle ב-style.css) - מסך הטעינה
// נשאר מוצג לפחות עד שקטע אנימציה שלם אחד מסתיים, גם אם הטעינה עצמה הסתיימה קודם.
const LOADING_MIN_MS = 4500;

export default function App() {
  if (!client) {
    return (
      <section id="screen-noserver" className="screen center active">
        <div className="big-emoji" aria-hidden="true">🔌</div>
        <h1>האפליקציה עוד לא מחוברת לשרת</h1>
        <p className="hint">הורה צריך להגדיר את כתובת Convex בקובץ <code>config.js</code>.</p>
      </section>
    );
  }
  return <Root />;
}

function Root() {
  useSyncExternalStore(subscribeAuth, authVersion);
  const sheet = useSheet();
  const token = state.token;
  const data = useQuery('data:get', token ? { token } : 'skip');
  const fdata = useQuery('friends:get', token ? { token } : 'skip') || null;
  const roster = useQuery('auth:legacyRoster', {});
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

  // קוד ילדים שמור במכשיר.
  useEffect(() => { restoreFamily().finally(() => { state.codeChecked = true; bumpAuth(); }); }, []);

  // כניסה לא תקפה, או חשבון מהגרסה הישנה (בלי משפחה).
  useEffect(() => {
    if (!token || data === undefined) return;
    if (data === null) { dropSession(); return; }
    if (!data.legacy || migrating.current) return;
    if (!data.canMigrate) { toast('צריך להיכנס מחדש עם קוד המשפחה'); dropSession(); return; }
    migrating.current = true;
    call('auth:migrateMe', { token }).catch(() => dropSession()).finally(() => { migrating.current = false; });
  }, [token, data]);

  const rawScreen = currentScreen(data);
  const [screen, setScreen] = useState(rawScreen);
  const loadingSince = useRef(rawScreen === 'loading' ? Date.now() : null);
  useEffect(() => {
    if (rawScreen === 'loading') {
      if (loadingSince.current == null) loadingSince.current = Date.now();
      setScreen('loading');
      return;
    }
    if (loadingSince.current == null) { setScreen(rawScreen); return; }
    const remain = LOADING_MIN_MS - (Date.now() - loadingSince.current);
    if (remain <= 0) { loadingSince.current = null; setScreen(rawScreen); return; }
    const t = setTimeout(() => { loadingSince.current = null; setScreen(rawScreen); }, remain);
    return () => clearTimeout(t);
  }, [rawScreen]);

  // דילוג ישר לקוד הסודי כשברור מי נכנס.
  useEffect(() => {
    if (state.token || state.legacyPeople === null || !state.codeChecked || state.pinFlow) return;
    if (state.view === 'setup' || (state.view === 'join' && state.fam) || !state.fam) return;
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
  useEffect(() => { applyTheme(role); }, [role]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen]);
  useEffect(() => {
    if (screen !== 'app') return;
    if (role === 'parent') localStorage.setItem(CODE_KEY, data.family.childCode);
    syncPush();
  }, [screen, role, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const isParent = role === 'parent';
  const isTeen = role === 'teen';
  const setTab = useCallback((t) => {
    setTabSel(t);
    if (location.hash !== '#' + t) history.pushState(null, '', '#' + t);
    window.scrollTo({ top: 0 });
  }, []);
  const openEntryFlow = useCallback((opts) => sheet.open('', <EntryFlow opts={opts} />), [sheet]);

  const ctx = useMemo(() => (screen === 'app'
    ? { data, fdata, token, me: data.me.id, isParent, setTab, openEntryFlow }
    : null), [screen, data, fdata, token, isParent, setTab, openEntryFlow]);

  useEffect(() => { sheet.setAppCtx(ctx); }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section id="screen-loading" className={'screen center' + (screen === 'loading' ? ' active' : '')}>
        <div className="coin-drop" aria-hidden="true">
          <div className="coin-drop__mask">
            <div className="coin-drop__coin">🪙</div>
          </div>
          <div className="coin-drop__floor" />
        </div>
        <p>רגע, מתחברים…</p>
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

// ---------- אנימציית מעבר גלגל השיניים לאריח הצף ----------
// גלגל השיניים קופץ ממקומו למרכז המסך (1 שנ'), ובמקביל מסתובב באיטיות וגדל עד
// לגודל מטבע חצי שקל (עוד 2 שנ'). אז מבזיקים ניצוצות והוא שוקע לאחור ונעלם
// במהירות (כ-0.35 שנ'), ולבסוף האריח האמיתי נפתח וגדל מאותה נקודה (1.5 שנ').
const COIN_SIZE = 192; // הגודל הסופי של גלגל השיניים לפני השקיעה
function GearLaunch({ fromRect, onDone }) {
  const [phase, setPhase] = useState('start'); // start -> flying -> sinking
  // onDone ב-ref כדי שרינדור מחדש של ההורה לא יאפס את הטיימר של הסיום
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase('flying'));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (phase !== 'flying') return;
    const t = setTimeout(() => setPhase('sinking'), 3000); // 1s קפיצה + 2s גדילה, מקבילים
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'sinking') return;
    const t = setTimeout(() => onDoneRef.current(), 350);
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
          <span className="gear-launch-icon">⚙️</span>
        </div>
      </div>
      {/* הניצוצות בשכבה נפרדת, כדי שלא ידהו ולא יסתובבו יחד עם הגלגל השוקע */}
      {phase === 'sinking' && (
        <div className="gear-sparks" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={'spark' + (i % 2 ? ' spark--short' : '')} style={{ '--ang': `${i * (360 / 14)}deg`, animationDelay: `${(i % 3) * 15}ms` }} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------- המסך הראשי ----------
function Shell({ tabSel, setTab, isParent, isTeen }) {
  const { data, fdata, token, me } = useApp();
  const role = data.me.role;
  // הלשונית הנבחרת: ברירת מחדל לפי תפקיד, ואם היא לא שייכת לתפקיד חוזרים לבית.
  let tab = tabSel || (isParent ? 'family' : 'home');
  if (((tab === 'family' || tab === 'manage') && !isParent) || (tab === 'friends' && !isTeen)) tab = 'home';

  const labels = TAB_LABELS[role] || TAB_LABELS.child;
  const friendReqs = data.people.filter((p) => p.friendsRequested).length;
  const teenReqs = data.people.filter((p) => p.teenRequested).length;
  const parentCount = data.entries.filter(isPending).length + friendReqs + teenReqs;
  const friendsCount = fdata && fdata.kind === 'teen' && fdata.enabled
    ? fdata.friendships.filter((f) => f.status === 'pending' && f.incoming).length
      + fdata.entries.filter((e) => isPending(e) && e.createdBy !== me).length
    : 0;

  const tabs = ['home', ...(isTeen ? ['friends'] : []), 'history', ...(isParent ? ['family', 'manage'] : [])];
  const myPending = isParent ? 0 : data.entries.filter((e) => isPending(e) && (e.from === me || e.to === me)).length;
  const badge = { home: myPending, family: isParent ? parentCount : 0, friends: friendsCount };

  const sheet = useSheet();
  const gearRef = useRef(null);
  const [launchRect, setLaunchRect] = useState(null);

  const openAccount = () => {
    if (gearRef.current) setLaunchRect(gearRef.current.getBoundingClientRect());
    else sheet.open('', <AccountSheet />);
  };
  const finishLaunch = useCallback(() => {
    setLaunchRect(null);
    sheet.open('', <AccountSheet />, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }, [sheet]);

  return (
    <>
      <header className="top">
        <div className="who-am-i">
          {data.me.avatar && <span className="avatar-sm" aria-hidden="true">{data.me.avatar}</span>}
          <div>
            <h1>{data.me.name} {data.family.name.replace(/^משפחת\s+/, '')}</h1>
          </div>
        </div>
        <button className="ghost light" type="button" aria-label="החשבון שלי" onClick={openAccount}>
          <span ref={gearRef} aria-hidden="true" style={launchRect ? { opacity: 0 } : undefined}>⚙️</span> החשבון שלי
        </button>
      </header>
      {launchRect && <GearLaunch fromRect={launchRect} onDone={finishLaunch} />}

      <nav className="tabs" role="tablist" aria-label="תפריט ראשי">
        {tabs.map((t) => (
          <button key={t} id={'tabbtn-' + t} role="tab" aria-controls={'tab-' + t} data-tab={t} className={'tab' + (tab === t ? ' active' : '')} aria-selected={tab === t} onClick={() => setTab(t)}>
            {labels[t] || DEFAULT_LABELS[t]}
            {badge[t] ? <span className="badge">{badge[t]}</span> : null}
          </button>
        ))}
      </nav>

      <main>
        <section id="tab-home" role="tabpanel" aria-labelledby="tabbtn-home" className={'panel' + (tab === 'home' ? ' active' : '')}>
          <Home data={data} token={token} />
        </section>
        {isTeen && (
          <section id="tab-friends" role="tabpanel" aria-labelledby="tabbtn-friends" className={'panel' + (tab === 'friends' ? ' active' : '')}>
            <FriendsTab data={data} fdata={fdata} token={token} />
          </section>
        )}
        <section id="tab-history" role="tabpanel" aria-labelledby="tabbtn-history" className={'panel' + (tab === 'history' ? ' active' : '')}>
          <HistoryTab data={data} token={token} me={me} isParent={isParent} />
        </section>
        {isParent && (
          <section id="tab-family" role="tabpanel" aria-labelledby="tabbtn-family" className={'panel' + (tab === 'family' ? ' active' : '')}>
            <FamilyTab data={data} fdata={fdata} token={token} />
          </section>
        )}
        {isParent && (
          <section id="tab-manage" role="tabpanel" aria-labelledby="tabbtn-manage" className={'panel' + (tab === 'manage' ? ' active' : '')}>
            <ManageTab data={data} token={token} />
          </section>
        )}
      </main>
    </>
  );
}
