import Constants from "expo-constants";

/** Cosmetics is the active backend. Vault is opt-in later via EXPO_PUBLIC_VAULT_API_URL. */
const DEFAULT_COSMETICS_URL = "https://os.cosmetics.lk";

type AppExtra = {
  appEnv?: string;
  apiBaseUrl?: string | null;
  cosmeticsApiUrl?: string | null;
  vaultApiUrl?: string | null;
};

function readExtra(): AppExtra {
  const fromExpoConfig = Constants.expoConfig?.extra;
  if (fromExpoConfig && typeof fromExpoConfig === "object") {
    return fromExpoConfig as AppExtra;
  }

  const legacyManifest = Constants.manifest as { extra?: AppExtra } | null;
  if (legacyManifest?.extra && typeof legacyManifest.extra === "object") {
    return legacyManifest.extra;
  }

  return {};
}

function normalizeUrl(value: unknown) {
  // Must type-check before calling .trim() — non-strings crash Hermes with
  // "TypeError: undefined is not a function" (seen on Honor release APK).
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const extra = readExtra();

/** Baked in at EAS build time via app.config.ts `extra`, with hardcoded production fallbacks. */
export const COSMETICS_API_URL =
  normalizeUrl(extra.cosmeticsApiUrl) ??
  normalizeUrl(process.env.EXPO_PUBLIC_COSMETICS_API_URL) ??
  DEFAULT_COSMETICS_URL;

/** Null unless explicitly configured — Vault stays disabled for now. */
export const VAULT_API_URL =
  normalizeUrl(extra.vaultApiUrl) ?? normalizeUrl(process.env.EXPO_PUBLIC_VAULT_API_URL);

export const API_BASE_URL =
  normalizeUrl(extra.apiBaseUrl) ?? normalizeUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

export function getConfiguredApiSummary() {
  return {
    cosmetics: COSMETICS_API_URL,
    vault: VAULT_API_URL,
    appEnv:
      (typeof extra.appEnv === "string" && extra.appEnv) ||
      process.env.EXPO_PUBLIC_APP_ENV ||
      "development",
  };
}
