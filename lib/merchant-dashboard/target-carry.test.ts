import { describe, expect, it } from "vitest";

import {
  carriedTargetAmountsEqual,
  shouldSyncCarriedTarget,
} from "@/lib/merchant-dashboard/target-carry";

describe("shouldSyncCarriedTarget", () => {
  it("syncs when this month has no history", () => {
    expect(shouldSyncCarriedTarget([])).toBe(true);
  });

  it("syncs when this month was only carried forward", () => {
    expect(shouldSyncCarriedTarget(["carry_forward"])).toBe(true);
  });

  it("skips after a manual set or update", () => {
    expect(shouldSyncCarriedTarget(["carry_forward", "update"])).toBe(false);
    expect(shouldSyncCarriedTarget(["set"])).toBe(false);
  });

  it("skips after an explicit remove", () => {
    expect(shouldSyncCarriedTarget(["remove"])).toBe(false);
  });
});

describe("carriedTargetAmountsEqual", () => {
  const base = {
    targetAmount: 800_000,
    shopTargetAmount: 500_000,
    onlineTargetAmount: 300_000,
    wholesaleTargetAmount: null,
  };

  it("treats matching amounts as equal", () => {
    expect(carriedTargetAmountsEqual(base, { ...base })).toBe(true);
  });

  it("detects a changed combined total", () => {
    expect(
      carriedTargetAmountsEqual(base, { ...base, targetAmount: 900_000 }),
    ).toBe(false);
  });
});
