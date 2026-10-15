// נקודת הכניסה של האתר: כל המסכים הם קומפוננטות React תחת <App />.
import { createRoot } from 'react-dom/client';
import { ConvexProvider } from 'convex/react';
import { client } from './lib/client.js';
import { SheetProvider } from './components/shared/Sheet.jsx';
import { ConfirmProvider } from './components/shared/Confirm.jsx';
import Toast from './components/shared/Toast.jsx';
import UpdateBanner from './components/shared/UpdateBanner.jsx';
import App from './App.jsx';

const tree = <ConfirmProvider><SheetProvider><App /><UpdateBanner /><Toast /></SheetProvider></ConfirmProvider>;
createRoot(document.getElementById('root')).render(client ? <ConvexProvider client={client}>{tree}</ConvexProvider> : tree);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
