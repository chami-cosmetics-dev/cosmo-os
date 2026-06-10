import type { ComponentType } from "react";

import { SENTRY_DSN } from "@/src/config";

export function initMonitoring() {
  if (!SENTRY_DSN) {
    return;
  }

  // Sentry is optional. Install @sentry/react-native and configure SENTRY_ORG
  // in EAS before enabling native crash reporting in production builds.
}

export function wrapRootComponent<T extends ComponentType<Record<string, unknown>>>(Component: T) {
  return Component;
}

export function captureException(_error: unknown, _context?: Record<string, unknown>) {
  // No-op until Sentry is configured for release builds.
}
