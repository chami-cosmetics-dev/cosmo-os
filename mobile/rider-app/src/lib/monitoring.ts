import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

import { APP_ENV, IS_PRODUCTION, SENTRY_DSN } from "@/src/config";

let initialized = false;

export function initMonitoring() {
  if (initialized || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: APP_ENV,
    enabled: !__DEV__ || APP_ENV !== "development",
    tracesSampleRate: IS_PRODUCTION ? 0.2 : 1,
    enableNative: true,
    enableAutoSessionTracking: true,
  });

  initialized = true;
}

export function wrapRootComponent<T extends ComponentType<Record<string, unknown>>>(Component: T) {
  if (!SENTRY_DSN) {
    return Component;
  }

  return Sentry.wrap(Component);
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
