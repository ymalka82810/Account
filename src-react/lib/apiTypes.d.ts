// טיפוסים לקריאות לשרת לפי שם ("entries:add"), נגזרים ישירות מהפונקציות ב-convex/.
// שם שלא קיים, שדה שלא קיים בארגומנטים או בתוצאה, יתגלו ב-`npm run typecheck`.
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

type Api = typeof api;
type NamesOf<Kind extends 'query' | 'mutation' | 'action'> = {
  [M in keyof Api & string]: {
    [F in keyof Api[M] & string]: Api[M][F] extends FunctionReference<Kind, any> ? `${M}:${F}` : never;
  }[keyof Api[M] & string];
}[keyof Api & string];

type RefOf<N extends string> = N extends `${infer M}:${infer F}`
  ? M extends keyof Api ? F extends keyof Api[M] ? Api[M][F] : never : never
  : never;

export type QueryName = NamesOf<'query'>;
export type MutationName = NamesOf<'mutation'>;
export type ActionName = NamesOf<'action'>;
export type ArgsOf<N extends string> = FunctionArgs<RefOf<N>>;
export type ReturnOf<N extends string> = Awaited<FunctionReturnType<RefOf<N>>>;
