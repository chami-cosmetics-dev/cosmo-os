import { classifyFailedErpSyncError } from "@/lib/failed-erp-sync-classification";

export const ERP_TRANSIENT_RETRY_DELAYS_MS = [500, 1500] as const;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Retry ERP calls that fail with 502 / deadlock / fetch failed before recording a Failed Sync row. */
export async function retryTransientErpOperation<T>(
  label: string,
  operation: () => Promise<T>,
  options?: {
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const delays = options?.delaysMs ?? ERP_TRANSIENT_RETRY_DELAYS_MS;
  const sleep = options?.sleep ?? defaultSleep;
  const maxAttempts = delays.length + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const delayMs = delays[attempt - 1];
      if (!classifyFailedErpSyncError(message).retryable || delayMs == null) {
        throw err;
      }
      console.warn(
        `[ERPNext] ${label} transient failure — retry ${attempt}/${maxAttempts}: ${message.slice(0, 200)}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
