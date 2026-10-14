import { useEffect, useRef, useSyncExternalStore } from 'react';
import { state, subscribeAuth, authVersion } from '../../state/state.js';
import { pressKey } from '../../state/auth.js';
import Welcome from './Welcome.jsx';
import Setup from './Setup.jsx';
import Login from './Login.jsx';
import Join from './Join.jsx';
import Pin from './Pin.jsx';

// מסכי הכניסה (welcome / setup / login / join / pin). כל מסך בקובץ משלו ב-auth/.
// ה-state המשותף (view, fam, pinFlow, legacyPeople) נשאר ב-state.js, וכל
// route() מודיע לכאן להתרנדר מחדש.
export default function Auth({ current }) {
  useSyncExternalStore(subscribeAuth, authVersion);
  const currentRef = useRef(current);
  currentRef.current = current;

  // הקלדה במקלדת פיזית במסך הקוד הסודי.
  useEffect(() => {
    const onKey = (ev) => {
      if (!state.pinFlow || state.token || currentRef.current !== 'pin') return;
      if (/^\d$/.test(ev.key)) pressKey(ev.key);
      else if (ev.key === 'Backspace') pressKey('del');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Welcome current={current} />
      <Setup current={current} />
      <Login current={current} />
      <Join current={current} />
      <Pin current={current} />
    </>
  );
}
