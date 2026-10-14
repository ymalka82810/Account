import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { state, CODE_KEY, THEME_COLOR, TAB_LABELS } from '../src/state.js';
import { call } from '../src/api.js';
import { toast } from '../src/helpers.js';
import { subscribeAuth, authVersion, bumpAuth } from '../src/authStore.js';
import { dropSession } from '../src/session.js';
import { restoreFamily, startPin, autoSkipPerson } from '../src/screens/auth.js';
import { syncPush } from '../src/push.js';
import { client } from './lib/client.js';
import { isPending } from './lib/computations.js';
import { AppCtx, useApp } from './appContext.js';
import { useSheet } from './components/Sheet.jsx';
import { EntryFlow } from './components/EntryFlow.jsx';
import { AccountSheet } from './components/AccountSheet.jsx';
import Auth from './components/Auth.jsx';
import Home from './components/Home.jsx';
import FriendsTab from './components/FriendsTab.jsx';
import FamilyTab from './components/FamilyTab.jsx';
import EntriesList from './components/EntriesList.jsx';

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

const DEFAULT_LABELS = { home: '🏠 הכסף שלי', friends: '🤝 חברים', history: '📜 מה היה', family: '👨‍👩‍👧 המשפחה' };

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
  const [tabSel, setTabSel] = useState(null);
  const migrating = useRef(false);

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

  const screen = currentScreen(data);

  // דילוג ישר לקוד הסודי כשברור מי נכנס.
  useEffect(() => {
    if (state.token || state.legacyPeople === null || !state.codeChecked || state.pinFlow) return;
    if (state.view === 'setup' || (state.view === 'join' && state.fam) || !state.fam) return;
    const skip = autoSkipPerson();
    if (skip) startPin(skip, false);
  });

  // כניסה או יציאה: סוגרים חלונות, ובכל כניסה מתחילים מהלשונית הראשית.
  useEffect(() => { sheet.close(); setTabSel(null); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const setTab = useCallback((t) => { setTabSel(t); window.scrollTo({ top: 0 }); }, []);
  const openEntryFlow = useCallback((opts) => sheet.open('', <EntryFlow opts={opts} />), [sheet]);

  const ctx = useMemo(() => (screen === 'app'
    ? { data, fdata, token, me: data.me.id, isParent, setTab, openEntryFlow }
    : null), [screen, data, fdata, token, isParent, setTab, openEntryFlow]);

  useEffect(() => { sheet.setAppCtx(ctx); }, [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section id="screen-loading" className={'screen center' + (screen === 'loading' ? ' active' : '')}>
        <div className="big-emoji" aria-hidden="true">🪙</div>
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

// ---------- המסך הראשי ----------
function Shell({ tabSel, setTab, isParent, isTeen }) {
  const { data, fdata, token, me } = useApp();
  const role = data.me.role;
  // הלשונית הנבחרת: ברירת מחדל לפי תפקיד, ואם היא לא שייכת לתפקיד חוזרים לבית.
  let tab = tabSel || (isParent ? 'family' : 'home');
  if ((tab === 'family' && !isParent) || (tab === 'friends' && !isTeen)) tab = 'home';

  const labels = TAB_LABELS[role] || TAB_LABELS.child;
  const friendReqs = data.people.filter((p) => p.friendsRequested).length;
  const teenReqs = data.people.filter((p) => p.teenRequested).length;
  const parentCount = data.entries.filter(isPending).length + friendReqs + teenReqs;
  const friendsCount = fdata && fdata.kind === 'teen' && fdata.enabled
    ? fdata.friendships.filter((f) => f.status === 'pending' && f.incoming).length
      + fdata.entries.filter((e) => isPending(e) && e.createdBy !== me).length
    : 0;

  const tabs = ['home', ...(isTeen ? ['friends'] : []), 'history', ...(isParent ? ['family'] : [])];
  const badge = { family: isParent ? parentCount : 0, friends: friendsCount };

  const sheet = useSheet();

  return (
    <>
      <header className="top">
        <div className="who-am-i">
          <span className="avatar-sm" aria-hidden="true">{data.me.avatar}</span>
          <div>
            <h1>{data.me.name}</h1>
            <p className="sub">{data.family.name}</p>
          </div>
        </div>
        <button className="ghost light" type="button" aria-label="החשבון שלי" onClick={() => sheet.open('', <AccountSheet />)}>⚙️ החשבון שלי</button>
      </header>

      <nav className="tabs" role="tablist" aria-label="תפריט ראשי">
        {tabs.map((t) => (
          <button key={t} role="tab" data-tab={t} className={'tab' + (tab === t ? ' active' : '')} aria-selected={tab === t} onClick={() => setTab(t)}>
            {labels[t] || DEFAULT_LABELS[t]}
            {badge[t] ? <span className="badge">{badge[t]}</span> : null}
          </button>
        ))}
      </nav>

      <main>
        <section id="tab-home" className={'panel' + (tab === 'home' ? ' active' : '')}>
          <Home data={data} token={token} />
        </section>
        {isTeen && (
          <section id="tab-friends" className={'panel' + (tab === 'friends' ? ' active' : '')}>
            <FriendsTab data={data} fdata={fdata} token={token} />
          </section>
        )}
        <section id="tab-history" className={'panel' + (tab === 'history' ? ' active' : '')}>
          <EntriesList list={data.entries.filter((e) => e.from === me || e.to === me)} emptyText="עדיין לא נרשם כלום."
            token={token} me={me} isParent={isParent} lookup={(id) => data.people.find((p) => p.id === id)} debtList={data.entries} />
        </section>
        {isParent && (
          <section id="tab-family" className={'panel' + (tab === 'family' ? ' active' : '')}>
            <FamilyTab data={data} fdata={fdata} token={token} />
          </section>
        )}
      </main>
    </>
  );
}
