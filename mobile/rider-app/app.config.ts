import type { ConfigContext, ExpoConfig } from "expo/config";

import appJson from "./app.json";

type AppEnvironment = "development" | "staging" | "production";

function resolveAppEnvironment(): AppEnvironment {
  const value = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (value === "production" || value === "staging") {
    return value;
  }
  return "development";
}

function resolveAppName(appEnv: AppEnvironment) {
  if (appEnv === "production") {
    return "Cosmo Rider";
  }
  if (appEnv === "staging") {
    return "Cosmo Rider (Staging)";
  }
  return "Cosmo Rider (Dev)";
}

function resolveAndroidPackage(appEnv: AppEnvironment) {
  if (appEnv === "production") {
    return "com.cosmo.rider";
  }
  if (appEnv === "staging") {
    return "com.cosmo.rider.staging";
  }
  return "com.cosmo.rider.dev";
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = resolveAppEnvironment();
  const plugins: ExpoConfig["plugins"] = ["expo-secure-store", "expo-font"];

  const projectId = appJson.expo.extra?.eas?.projectId;

  return {
    ...config,
    ...appJson.expo,
    name: resolveAppName(appEnv),
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      ...appJson.expo.updates,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    android: {
      ...appJson.expo.android,
      package: resolveAndroidPackage(appEnv),
      ...(appEnv !== "production" ? { usesCleartextTraffic: true } : {}),
    },
    plugins,
    extra: {
      ...appJson.expo.extra,
      appEnv,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? null,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? null,
    },
  };
};
