// גרסת הפיתוח (npm run web:dev) של emojiJsx.js
import { jsxDEV as rjsxDEV, Fragment } from 'react/jsx-dev-runtime';
import { fix } from './emojiJsx.js';
export { Fragment };
export function jsxDEV(type, props, key, isStatic, source, self) {
  return rjsxDEV(type, fix(type, props), key, isStatic, source, self);
}
