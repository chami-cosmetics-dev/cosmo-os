export type AppEnvironment = "development" | "staging" | "production";

const configuredAppEnv = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();

export const APP_ENV: AppEnvironment =
  configuredAppEnv === "production" || configuredAppEnv === "staging" ? configuredAppEnv : "development";

export const IS_PRODUCTION = APP_ENV === "production";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL =
  configuredApiBaseUrl && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl
    : APP_ENV === "development"
      ? "http://10.0.2.2:3000"
      : "";

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";

export function getAppEnvironmentLabel(appEnv: AppEnvironment = APP_ENV) {
  if (appEnv === "production") return "Production";
  if (appEnv === "staging") return "Staging";
  return "Development";
}
