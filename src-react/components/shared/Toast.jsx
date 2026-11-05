import { useSyncExternalStore } from 'react';
import { subscribeToast, toastSnapshot, dismissToast } from '../../lib/helpers.js';

// הודעה קצרה בתחתית המסך. toast() מ-helpers.js מעדכן את החנות, והקומפוננטה מציגה אותה.
export default function Toast() {
  const { msg, action } = useSyncExternalStore(subscribeToast, toastSnapshot);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!msg}>
      <span>{msg}</span>
      {action && <button type="button" className="toast-action" onClick={() => { dismissToast(); action.onClick(); }}>{action.label}</button>}
    </div>
  );
}
