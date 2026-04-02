type PerfMarks = Record<string, number>;

function isPerfLoggingEnabled() {
  return process.env.ENABLE_PERF_LOGS === "true";
}

function formatServerTimingKey(label: string) {
  return label.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function createPerfLogger(scope: string, initial?: Record<string, unknown>) {
  const enabled = isPerfLoggingEnabled();
  const startedAt = Date.now();
  const marks: PerfMarks = {};
  let totalMs = 0;

  function mark(label: string) {
    marks[label] = Date.now() - startedAt;
  }

  function end(details?: Record<string, unknown>) {
    totalMs = Date.now() - startedAt;
    if (!enabled) return;

    console.info(`[Perf] ${scope}`, {
      totalMs,
      ...initial,
      ...details,
      marks,
    });
  }

  function toServerTimingHeader() {
    const entries = [
      ...Object.entries(marks).map(([label, duration]) => ({
        label: formatServerTimingKey(label),
        duration,
      })),
      {
        label: "total",
        duration: totalMs || Date.now() - startedAt,
      },
    ];

    return entries.map((entry) => `${entry.label};dur=${entry.duration}`).join(", ");
  }

  return {
    enabled,
    mark,
    end,
    toServerTimingHeader,
  };
}
