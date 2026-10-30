// נקודת הכניסה של האתר: כל המסכים הם קומפוננטות React תחת <App />.
import { createRoot } from 'react-dom/client';
import { ConvexProvider } from 'convex/react';
import { client } from './lib/client.js';
import { initialLang, setLang } from './i18n/index.js';
import { useLang } from './i18n/useLang.js';
import { SheetProvider } from './components/shared/Sheet.jsx';
import { ConfirmProvider } from './components/shared/Confirm.jsx';
import Toast from './components/shared/Toast.jsx';
import UpdateBanner from './components/shared/UpdateBanner.jsx';
import App from './App.jsx';

// key={lang}: החלפת שפה בונה את העץ מחדש, כך שכל t() בכל מקום מתרנדר שוב בלי לחבר כל קומפוננטה.
function Root() {
  const lang = useLang();
  const tree = <ConfirmProvider key={lang}><SheetProvider><App /><UpdateBanner /><Toast /></SheetProvider></ConfirmProvider>;
  return client ? <ConvexProvider client={client}>{tree}</ConvexProvider> : tree;
}

// טוענים את מילון השפה (שפה שמורה או שפת המכשיר) לפני הרינדור הראשון, כדי שלא יהבהב טקסט בשפה הלא נכונה.
// אם ההורדה נכשלה (אין חיבור) נשארים באנגלית.
setLang(initialLang(), { persist: false }).finally(() => {
  createRoot(document.getElementById('root')).render(<Root />);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
