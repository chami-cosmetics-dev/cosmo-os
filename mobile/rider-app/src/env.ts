import Constants from "expo-constants";

/** Production backends — safe to embed; used as last-resort fallback in release APKs. */
const DEFAULT_COSMETICS_URL = "https://os.cosmetics.lk";
const DEFAULT_VAULT_URL = "https://vault-os-sandy.vercel.app";

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

const extra = readExtra();

function normalizeUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Baked in at EAS build time via app.config.ts `extra`, with hardcoded production fallbacks. */
export const COSMETICS_API_URL =
  normalizeUrl(extra.cosmeticsApiUrl) ??
  normalizeUrl(process.env.EXPO_PUBLIC_COSMETICS_API_URL) ??
  DEFAULT_COSMETICS_URL;

export const VAULT_API_URL =
  normalizeUrl(extra.vaultApiUrl) ??
  normalizeUrl(process.env.EXPO_PUBLIC_VAULT_API_URL) ??
  DEFAULT_VAULT_URL;

export const API_BASE_URL =
  normalizeUrl(extra.apiBaseUrl) ?? normalizeUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

export function getConfiguredApiSummary() {
  return {
    cosmetics: COSMETICS_API_URL,
    vault: VAULT_API_URL,
    appEnv: extra.appEnv ?? process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  };
}
