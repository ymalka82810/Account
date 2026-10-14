import { state, TOKEN_KEY } from './state.js';
import { bumpAuth } from './authStore.js';
import { restoreFamily } from './screens/auth.js';

// ---------- מצב הכניסה ----------
// ה-state (token, fam, view, pinFlow, ...) נשאר ב-state.js, ו-App.jsx קורא
// ממנו בכל רינדור. route() רק מודיע לו שמשהו השתנה.
export const route = bumpAuth;

export function setToken(t) {
  state.token = t;
  localStorage.setItem(TOKEN_KEY, t);
  bumpAuth();
}

export function dropSession() {
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  state.pinFlow = null;
  state.codeChecked = false;
  bumpAuth();
  restoreFamily().finally(() => { state.codeChecked = true; bumpAuth(); });
}
