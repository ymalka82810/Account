import { ConvexReactClient } from 'convex/react';

// הלקוח היחיד של Convex באתר. null אם config.js לא הגדיר כתובת שרת.
export const client = window.CONVEX_URL ? new ConvexReactClient(window.CONVEX_URL) : null;
