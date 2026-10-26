import type { DataModelFromSchemaDefinition, DocumentByName, SystemTableNames, TableNamesInDataModel } from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<T extends TableNames> = DocumentByName<DataModel, T>;
export type Id<T extends TableNames | SystemTableNames> = GenericId<T>;
