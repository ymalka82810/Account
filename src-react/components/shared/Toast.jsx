import { useSyncExternalStore } from 'react';
import { subscribeToast, toastMessage } from '../../lib/helpers.js';

// הודעה קצרה בתחתית המסך. toast() מ-helpers.js מעדכן את החנות, והקומפוננטה מציגה אותה.
export default function Toast() {
  const msg = useSyncExternalStore(subscribeToast, toastMessage);
  return <div className="toast" role="status" aria-live="polite" hidden={!msg}>{msg}</div>;
}
