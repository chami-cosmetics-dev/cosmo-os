import { describe, expect, it } from "vitest";

import {
  buildDumpKeyPlan,
  formatDumpTimestamp,
  isProtectedSystem,
  parseProtectedSystem,
  retentionClassesFor,
  systemFromObjectKey,
} from "./object-key";

describe("protected systems", () => {
  it("accepts vault, cosmo-dev, cosmo-prod", () => {
    expect(isProtectedSystem("vault")).toBe(true);
    expect(isProtectedSystem("cosmo-dev")).toBe(true);
    expect(isProtectedSystem("cosmo-prod")).toBe(true);
  });

  it("rejects invalid system ids", () => {
    expect(isProtectedSystem("prod")).toBe(false);
    expect(() => parseProtectedSystem("neon")).toThrow(/Invalid protected system/);
  });
});

describe("formatDumpTimestamp", () => {
  it("emits compact UTC stamp without colons", () => {
    expect(formatDumpTimestamp(new Date("2026-09-05T16:30:00.000Z"))).toBe(
      "20260905T163000Z",
    );
  });
});

describe("retentionClassesFor", () => {
  // Sunday 06 Sep 2026 10:00 Asia/Colombo = 04:30 UTC
  const colomboSunday = new Date("2026-09-06T04:30:00.000Z");
  // Monday 07 Sep 2026 10:00 Colombo = 04:30 UTC
  const colomboMonday = new Date("2026-09-07T04:30:00.000Z");
  // 1 Sep 2026 12:00 Colombo = 06:30 UTC (Tuesday)
  const colomboFirst = new Date("2026-09-01T06:30:00.000Z");

  it("always includes daily", () => {
    expect(retentionClassesFor("cosmo-prod", colomboMonday)).toEqual(["daily"]);
  });

  it("adds weekly on Colombo Sunday for vault and cosmo-prod", () => {
    expect(retentionClassesFor("vault", colomboSunday)).toEqual([
      "daily",
      "weekly",
    ]);
    expect(retentionClassesFor("cosmo-prod", colomboSunday)).toEqual([
      "daily",
      "weekly",
    ]);
  });

  it("adds monthly on Colombo day 1 for vault and cosmo-prod", () => {
    expect(retentionClassesFor("vault", colomboFirst)).toEqual([
      "daily",
      "monthly",
    ]);
  });

  it("never adds weekly or monthly for cosmo-dev", () => {
    expect(retentionClassesFor("cosmo-dev", colomboSunday)).toEqual(["daily"]);
    expect(retentionClassesFor("cosmo-dev", colomboFirst)).toEqual(["daily"]);
  });
});

describe("buildDumpKeyPlan", () => {
  it("builds contract keys for a weekday prod dump", () => {
    const takenAt = new Date("2026-09-05T16:30:00.000Z");
    const plan = buildDumpKeyPlan("cosmo-prod", takenAt);
    expect(plan.dailyKey).toBe(
      "daily/cosmo-prod/cosmo-prod-20260905T163000Z.dump.age",
    );
    expect(plan.weeklyKey).toBeNull();
    expect(plan.monthlyKey).toBeNull();
    expect(plan.statusKey).toBe("status/cosmo-prod.json");
  });

  it("parses system from object key", () => {
    expect(
      systemFromObjectKey("daily/vault/vault-20260905T163000Z.dump.age"),
    ).toBe("vault");
  });
});
