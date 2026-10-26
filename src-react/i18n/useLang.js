import { useSyncExternalStore } from 'react';
import { currentLang, subscribeLang } from './index.js';

// הקומפוננטה מתרנדרת מחדש כשהשפה מתחלפת.
export const useLang = () => useSyncExternalStore(subscribeLang, currentLang);
