import { parseProtectedSystem, type ProtectedSystem } from "./object-key";

export type BackupStatus = {
  system: ProtectedSystem;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  ok: boolean;
  error: string | null;
  objectKey: string | null;
  bytes: number | null;
};

const OVERDUE_MS = 24 * 60 * 60 * 1000;

/** Strip URLs and user:pass@ so status JSON never holds connection strings. */
export function sanitizeError(message: string): string {
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/\b[\w.-]+:[^@\s]{1,}@/g, "[redacted-auth]@")
    .slice(0, 500);
}

export function parseBackupStatus(raw: unknown): BackupStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.system !== "string") return null;
  try {
    parseProtectedSystem(o.system);
  } catch {
    return null;
  }
  return {
    system: o.system as ProtectedSystem,
    lastAttemptAt: typeof o.lastAttemptAt === "string" ? o.lastAttemptAt : "",
    lastSuccessAt:
      typeof o.lastSuccessAt === "string" ? o.lastSuccessAt : null,
    ok: Boolean(o.ok),
    error: typeof o.error === "string" ? o.error : null,
    objectKey: typeof o.objectKey === "string" ? o.objectKey : null,
    bytes: typeof o.bytes === "number" ? o.bytes : null,
  };
}

export function mergeStatus(
  existing: BackupStatus | null,
  attempt: {
    system: ProtectedSystem;
    attemptedAt: Date;
    ok: boolean;
    error?: string | null;
    objectKey?: string | null;
    bytes?: number | null;
  },
): BackupStatus {
  const attemptedAt = attempt.attemptedAt.toISOString();
  if (attempt.ok) {
    return {
      system: attempt.system,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      ok: true,
      error: null,
      objectKey: attempt.objectKey ?? null,
      bytes: attempt.bytes ?? null,
    };
  }
  return {
    system: attempt.system,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: existing?.lastSuccessAt ?? null,
    ok: false,
    error: sanitizeError(attempt.error ?? "dump failed"),
    objectKey: null,
    bytes: null,
  };
}

export function hoursSinceSuccess(
  status: BackupStatus,
  now: Date = new Date(),
): number | null {
  if (!status.lastSuccessAt) return null;
  const then = new Date(status.lastSuccessAt).getTime();
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / (60 * 60 * 1000);
}

/** Prod and vault are overdue after 24h without success. cosmo-dev uses the same clock. */
export function isOverdue(
  status: BackupStatus,
  now: Date = new Date(),
): boolean {
  if (!status.lastSuccessAt) return true;
  const then = new Date(status.lastSuccessAt).getTime();
  if (Number.isNaN(then)) return true;
  return now.getTime() - then > OVERDUE_MS;
}
