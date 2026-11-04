import type { ComponentType } from "react";

import { SENTRY_DSN, APP_ENV } from "@/src/config";

/**
 * Lightweight Sentry reporting without forcing a native rebuild when DSN is unset.
 * For full native crash symbolication, install `@sentry/react-native` and set
 * EXPO_PUBLIC_SENTRY_DSN + SENTRY_* EAS secrets.
 */
function sentryIngestUrl() {
  if (!SENTRY_DSN) return null;
  try {
    const url = new URL(SENTRY_DSN);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/store/?sentry_version=7&sentry_key=${publicKey}`;
  } catch {
    return null;
  }
}

export function initMonitoring() {
  if (!SENTRY_DSN) return;
  // Reserved for native SDK init when package is added.
}

export function wrapRootComponent<T extends ComponentType<Record<string, unknown>>>(Component: T) {
  return Component;
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  const ingest = sentryIngestUrl();
  if (!ingest) return;

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  const payload = {
    message,
    level: "error",
    platform: "javascript",
    environment: APP_ENV,
    timestamp: Date.now() / 1000,
    tags: { app: "cosmo-rider" },
    extra: context ?? {},
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: message,
          stacktrace: stack
            ? {
                frames: stack
                  .split("\n")
                  .slice(1, 12)
                  .map((line) => ({ filename: line.trim(), function: line.trim() })),
              }
            : undefined,
        },
      ],
    },
  };

  void fetch(ingest, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Never block rider flows on monitoring failures.
  });
}
