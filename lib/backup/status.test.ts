import { describe, expect, it } from "vitest";

import {
  hoursSinceSuccess,
  isOverdue,
  mergeStatus,
  sanitizeError,
} from "./status";

const existing = {
  system: "cosmo-prod" as const,
  lastAttemptAt: "2026-09-04T16:00:00.000Z",
  lastSuccessAt: "2026-09-04T16:00:00.000Z",
  ok: true,
  error: null,
  objectKey: "daily/cosmo-prod/cosmo-prod-20260904T160000Z.dump.age",
  bytes: 10,
};

describe("sanitizeError", () => {
  it("redacts connection strings", () => {
    expect(
      sanitizeError(
        "connect failed postgresql://neondb_owner:s3cret@host/neondb",
      ),
    ).not.toMatch(/s3cret/);
    expect(
      sanitizeError("postgresql://neondb_owner:s3cret@host/neondb boom"),
    ).toMatch(/\[redacted-url\]/);
  });
});

describe("mergeStatus", () => {
  it("sets lastSuccessAt on success", () => {
    const next = mergeStatus(existing, {
      system: "cosmo-prod",
      attemptedAt: new Date("2026-09-05T16:30:00.000Z"),
      ok: true,
      objectKey: "daily/cosmo-prod/cosmo-prod-20260905T163000Z.dump.age",
      bytes: 99,
    });
    expect(next.ok).toBe(true);
    expect(next.lastSuccessAt).toBe("2026-09-05T16:30:00.000Z");
    expect(next.bytes).toBe(99);
  });

  it("preserves lastSuccessAt on failure", () => {
    const next = mergeStatus(existing, {
      system: "cosmo-prod",
      attemptedAt: new Date("2026-09-05T16:30:00.000Z"),
      ok: false,
      error: "pg_dump exit 1",
    });
    expect(next.ok).toBe(false);
    expect(next.lastSuccessAt).toBe("2026-09-04T16:00:00.000Z");
    expect(next.objectKey).toBeNull();
    expect(next.bytes).toBeNull();
    expect(next.error).toBe("pg_dump exit 1");
  });

  it("keeps lastSuccessAt null when there was never a success", () => {
    const next = mergeStatus(null, {
      system: "vault",
      attemptedAt: new Date("2026-09-05T16:30:00.000Z"),
      ok: false,
      error: "unreachable",
    });
    expect(next.lastSuccessAt).toBeNull();
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-09-06T16:00:00.000Z");

  it("is overdue when last success is older than 24h", () => {
    expect(isOverdue(existing, now)).toBe(true);
  });

  it("is not overdue within 24h", () => {
    expect(
      isOverdue(
        { ...existing, lastSuccessAt: "2026-09-06T10:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("is overdue when never succeeded", () => {
    expect(isOverdue({ ...existing, lastSuccessAt: null }, now)).toBe(true);
  });

  it("computes hours since success", () => {
    expect(hoursSinceSuccess(existing, now)).toBe(48);
  });
});
