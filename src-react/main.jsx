// נקודת כניסה חדשה ל-React. בשלב הזה היא עדיין לא מחוברת לאתר החי
// ולא ל-Convex האמיתי — מציגה את מסך הבית (Home) מול נתוני דמה,
// כדי לוודא שהקומפוננטה והלוגיקה נכונות לפני שמחברים backend אמיתי.
import { createRoot } from 'react-dom/client';
import Home from './components/Home.jsx';

// נתוני דמה באותו מבנה בדיוק שמחזירה convex/data.ts (query data:get).
const mockData = {
  me: { id: 'p1', name: 'יוחאי', role: 'parent', avatar: '🦊' },
  people: [
    { id: 'p1', name: 'יוחאי', role: 'parent', avatar: '🦊' },
    { id: 'p2', name: 'נועה', role: 'child', avatar: '🐼' },
    { id: 'p3', name: 'איתן', role: 'teen', avatar: '🦁' },
  ],
  entries: [
    { id: 'e1', kind: 'debt', from: 'p1', to: 'p2', amount: 2000, note: 'דמי כיס', date: '2026-10-01', createdAt: 1, status: 'approved', debtId: null },
    { id: 'e2', kind: 'debt', from: 'p3', to: 'p1', amount: 1500, note: 'הלוואה', date: '2026-10-05', createdAt: 2, status: 'approved', debtId: null },
  ],
};

function App() {
  const openEntryFlow = (opts) => alert('openEntryFlow (עדיין לא מחובר):\n' + JSON.stringify(opts, null, 2));
  return <Home data={mockData} openEntryFlow={openEntryFlow} />;
}

const rootEl = document.getElementById('react-root');
if (rootEl) createRoot(rootEl).render(<App />);
