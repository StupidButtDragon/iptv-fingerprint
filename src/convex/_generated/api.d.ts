/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as channels from "../channels.js";
import type * as collect from "../collect.js";
import type * as enrich from "../enrich.js";
import type * as helpers from "../helpers.js";
import type * as investigate from "../investigate.js";
import type * as jobs from "../jobs.js";
import type * as ping from "../ping.js";
import type * as providers from "../providers.js";
import type * as scans from "../scans.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  channels: typeof channels;
  collect: typeof collect;
  enrich: typeof enrich;
  helpers: typeof helpers;
  investigate: typeof investigate;
  jobs: typeof jobs;
  ping: typeof ping;
  providers: typeof providers;
  scans: typeof scans;
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
