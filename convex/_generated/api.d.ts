/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as biometric from "../biometric.js";
import type * as crons from "../crons.js";
import type * as currency from "../currency.js";
import type * as data from "../data.js";
import type * as der from "../der.js";
import type * as deviceMove from "../deviceMove.js";
import type * as email from "../email.js";
import type * as emailAuth from "../emailAuth.js";
import type * as emailCodes from "../emailCodes.js";
import type * as entries from "../entries.js";
import type * as family from "../family.js";
import type * as friends from "../friends.js";
import type * as fx from "../fx.js";
import type * as goals from "../goals.js";
import type * as googleAuth from "../googleAuth.js";
import type * as googleLink from "../googleLink.js";
import type * as history from "../history.js";
import type * as ledger from "../ledger.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as notebook from "../notebook.js";
import type * as notify from "../notify.js";
import type * as people from "../people.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as recurring from "../recurring.js";
import type * as reminders from "../reminders.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  admin: typeof admin;
  auth: typeof auth;
  biometric: typeof biometric;
  crons: typeof crons;
  currency: typeof currency;
  data: typeof data;
  der: typeof der;
  deviceMove: typeof deviceMove;
  email: typeof email;
  emailAuth: typeof emailAuth;
  emailCodes: typeof emailCodes;
  entries: typeof entries;
  family: typeof family;
  friends: typeof friends;
  fx: typeof fx;
  goals: typeof goals;
  googleAuth: typeof googleAuth;
  googleLink: typeof googleLink;
  history: typeof history;
  ledger: typeof ledger;
  lib: typeof lib;
  maintenance: typeof maintenance;
  notebook: typeof notebook;
  notify: typeof notify;
  people: typeof people;
  push: typeof push;
  pushSend: typeof pushSend;
  recurring: typeof recurring;
  reminders: typeof reminders;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
