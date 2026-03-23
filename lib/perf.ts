type PerfMarks = Record<string, number>;

function isPerfLoggingEnabled() {
  return process.env.ENABLE_PERF_LOGS === "true";
}

export function createPerfLogger(scope: string, initial?: Record<string, unknown>) {
  const enabled = isPerfLoggingEnabled();
  const startedAt = Date.now();
  const marks: PerfMarks = {};

  function mark(label: string) {
    if (!enabled) return;
    marks[label] = Date.now() - startedAt;
  }

  function end(details?: Record<string, unknown>) {
    if (!enabled) return;

    console.info(`[Perf] ${scope}`, {
      totalMs: Date.now() - startedAt,
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
