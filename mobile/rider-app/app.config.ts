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
  const isReleaseApk = appEnv === "production" || appEnv === "staging";
  const projectId = appJson.expo.extra?.eas?.projectId;

  const plugins: ExpoConfig["plugins"] = ["expo-router", "expo-secure-store", "expo-font"];

  return {
    ...config,
    ...appJson.expo,
    name: resolveAppName(appEnv),
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    splash: {
      backgroundColor: "#f5f7fb",
    },
    ...(isReleaseApk
      ? {}
      : {
          runtimeVersion: { policy: "appVersion" },
          updates: {
            fallbackToCacheTimeout: 0,
            ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
          },
        }),
    android: {
      ...appJson.expo.android,
      package: resolveAndroidPackage(appEnv),
      ...(appEnv !== "production" ? { usesCleartextTraffic: true } : {}),
    },
    plugins,
    extra: {
      ...appJson.expo.extra,
      appEnv,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || null,
      cosmeticsApiUrl: process.env.EXPO_PUBLIC_COSMETICS_API_URL?.trim() || null,
      vaultApiUrl: process.env.EXPO_PUBLIC_VAULT_API_URL?.trim() || null,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || null,
    },
  };
};
