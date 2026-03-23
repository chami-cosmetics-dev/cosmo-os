const DATABASE_UNAVAILABLE_PATTERNS = [
  "Can't reach database server",
  "Connection refused",
  "Connection terminated unexpectedly",
  "Timed out fetching a new connection from the connection pool",
  "Server has closed the connection",
] as const;

export function maybeLogSlowDbRequest(
  operation: string,
  startedAt: number,
  details?: Record<string, unknown>,
) {
  const thresholdMs = Number(process.env.DB_REQUEST_SLOW_MS ?? "400");
  const durationMs = Date.now() - startedAt;
  if (!Number.isFinite(thresholdMs) || durationMs < thresholdMs) {
    return;
  }

  console.warn(
    `[DB Slow Request] ${operation} took ${durationMs}ms`,
    details ?? {},
  );
}


export function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    name?: string;
  };

  if (candidate.code === "P1001") {
    return true;
  }

  if (candidate.name === "PrismaClientInitializationError") {
    return true;
  }

  const message = candidate.message ?? "";
  return DATABASE_UNAVAILABLE_PATTERNS.some((pattern) => message.includes(pattern));
}
