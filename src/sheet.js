import { $ } from './helpers.js';
import { state } from './state.js';

// ---------- חלון קופץ ----------
export function openSheet(title, body) {
  state.sheetReturnFocus = document.activeElement;
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren(body);
  $('sheetWrap').hidden = false;
  document.body.classList.add('noscroll');
  $('sheetClose').focus();
}
export function closeSheet() {
  if ($('sheetWrap').hidden) return;
  $('sheetWrap').hidden = true;
  $('sheetBody').replaceChildren();
  document.body.classList.remove('noscroll');
  if (state.sheetReturnFocus && state.sheetReturnFocus.focus) state.sheetReturnFocus.focus();
  state.sheetReturnFocus = null;
}
