"use client";

type PerfDetails = Record<string, unknown>;

function isEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_CLIENT_PERF_LOGS === "true";
}

export function createClientPerfLogger(scope: string, initial?: PerfDetails) {
  const enabled = isEnabled() && typeof performance !== "undefined";
  const startedAt = enabled ? performance.now() : 0;
  const marks: Record<string, number> = {};

  function mark(label: string) {
    if (!enabled) return;
    marks[label] = Number((performance.now() - startedAt).toFixed(1));
  }

  function end(details?: PerfDetails) {
    if (!enabled) return;
    console.info(`[ClientPerf] ${scope}`, {
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
      ...initial,
      ...details,
      marks,
    });
  }

  return {
    enabled,
    mark,
    end,
  };
}
