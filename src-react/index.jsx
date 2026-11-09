// נקודת הכניסה של האתר: כל המסכים הם קומפוננטות React תחת <App />.
import { createRoot } from 'react-dom/client';
// הפונט נארז באפליקציה (בלי גוגל): פרטיות, ועובד גם בלי אינטרנט
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import { ConvexProvider } from 'convex/react';
import { client } from './lib/client.js';
import { initialLang, setLang } from './i18n/index.js';
import { useLang } from './i18n/useLang.js';
import { SheetProvider } from './components/shared/Sheet.jsx';
import { ConfirmProvider } from './components/shared/Confirm.jsx';
import Toast from './components/shared/Toast.jsx';
import UpdateBanner from './components/shared/UpdateBanner.jsx';
import OfflineBanner from './components/shared/OfflineBanner.jsx';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import AppKeyboard from './components/shared/AppKeyboard.jsx';
import App from './App.jsx';
import { preloadImages } from './lib/preloadImages.js';
import { initBarTapSound } from './lib/metalSound.js';
import { applyMotion } from './lib/feel.js';
import { initDeepLinks } from './lib/deepLink.js';

// key={lang}: החלפת שפה בונה את העץ מחדש, כך שכל t() בכל מקום מתרנדר שוב בלי לחבר כל קומפוננטה.
function Root() {
  const lang = useLang();
  const tree = <ConfirmProvider key={lang}><SheetProvider><App /><AppKeyboard /><UpdateBanner /><OfflineBanner /><Toast /></SheetProvider></ConfirmProvider>;
  // גיבוי אחרון: שגיאה שלא נתפסה בגבול של לשונית (או מחוץ ללשוניות) מציגה הסבר ולא מסך לבן
  return <ErrorBoundary root>{client ? <ConvexProvider client={client}>{tree}</ConvexProvider> : tree}</ErrorBoundary>;
}

// טוענים את מילון השפה (שפה שמורה או שפת המכשיר) ואת תמונות המטילים לפני הרינדור הראשון, כדי שלא יהבהב טקסט
// בשפה הלא נכונה ושלא יופיע מספר בלי המטיל שמאחוריו. אם ההורדה נכשלה (אין חיבור) נשארים באנגלית.
Promise.all([setLang(initialLang(), { persist: false }).catch(() => {}), preloadImages()]).finally(() => {
  createRoot(document.getElementById('root')).render(<Root />);
});

initBarTapSound();
applyMotion();
initDeepLinks();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
