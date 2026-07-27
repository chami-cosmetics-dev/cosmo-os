import type { ComponentType } from "react";

import { SENTRY_DSN } from "@/src/config";

/**
 * Sentry works fine for sideloaded APKs (no Play Store required).
 * To enable: install `@sentry/react-native`, set EXPO_PUBLIC_SENTRY_DSN in EAS,
 * and wire init here. Until then this stays a no-op so builds stay simple.
 */
export function initMonitoring() {
  if (!SENTRY_DSN) {
    return;
  }
}

export function wrapRootComponent<T extends ComponentType<Record<string, unknown>>>(Component: T) {
  return Component;
}

export function captureException(_error: unknown, _context?: Record<string, unknown>) {
  // No-op until @sentry/react-native is installed for release APKs.
}
