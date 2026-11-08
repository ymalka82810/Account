import { useSyncExternalStore } from 'react';
import { subscribeToast, toastSnapshot, dismissToast } from '../../lib/helpers.js';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss.js';

// הודעה קצרה בתחתית המסך. toast() מ-helpers.js מעדכן את החנות, והקומפוננטה מציגה אותה. אפשר להחליק אותה הצידה כדי לסגור.
export default function Toast() {
  const { msg, action } = useSyncExternalStore(subscribeToast, toastSnapshot);
  const swipe = useSwipeDismiss(dismissToast);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!msg} {...swipe}>
      <span>{msg}</span>
      {action && <button type="button" className="toast-action" onClick={() => { dismissToast(); action.onClick(); }}>{action.label}</button>}
    </div>
  );
}
