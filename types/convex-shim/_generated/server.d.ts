// תחליף לטיפוסים ש-`convex dev` מייצר ב-convex/_generated, כדי שבדיקת הטיפוסים תעבוד בלי חיבור לפרויקט.
// api.d.ts נוצר ע"י scripts/typecheck.mjs. אם convex/_generated קיים, הוא מקבל עדיפות (ראו rootDirs ב-tsconfig).
import {
  ActionBuilder, GenericActionCtx, GenericDatabaseReader, GenericDatabaseWriter,
  GenericMutationCtx, GenericQueryCtx, MutationBuilder, QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
