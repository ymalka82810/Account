// מרכיב את מסכי הכניסה (src-react/components/Auth.jsx). הקומפוננטה מצייר
// את התוכן לתוך ה-<section id="screen-..."> שכבר קיימים ב-index.html.
// היא לא משתמשת ב-Convex hooks: הקריאות לשרת עוברות דרך call() הישן.
import { createRoot } from 'react-dom/client';
import Auth from './components/Auth.jsx';

export function mountAuth() {
  const host = document.createElement('div');
  host.hidden = true; // רק כדי שיהיה root; התוכן עצמו מצויר בתוך ה-sections דרך portals
  document.body.append(host);
  createRoot(host).render(<Auth />);
}
