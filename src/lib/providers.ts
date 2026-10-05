// Built-in provider profiles ship in the Python package's known_providers.json —
// the web app imports the same file so both stay in sync.
import builtinRaw from "../../iptv_fingerprint/analysis/known_providers.json";
import type { ProviderProfile } from "./types";

export const builtinProviders: Record<string, ProviderProfile> =
  builtinRaw as unknown as Record<string, ProviderProfile>;

export const builtinProviderIds = Object.keys(builtinProviders);

export function mergeProviders(
  builtin: Record<string, ProviderProfile>,
  user: Record<string, ProviderProfile>,
): Record<string, ProviderProfile> {
  return { ...builtin, ...user };
}
