import { describe, expect, it } from "vitest";

import {
  DEFAULT_REORDER_THRESHOLD_PERCENT,
  effectiveReorderThresholdPercent,
  isBelowReorderThreshold,
} from "@/lib/osf/threshold";

describe("effectiveReorderThresholdPercent", () => {
  it("defaults null/invalid to 70", () => {
    expect(effectiveReorderThresholdPercent(null)).toBe(DEFAULT_REORDER_THRESHOLD_PERCENT);
    expect(effectiveReorderThresholdPercent(undefined)).toBe(70);
    expect(effectiveReorderThresholdPercent(0)).toBe(70);
    expect(effectiveReorderThresholdPercent(101)).toBe(70);
  });

  it("keeps valid 1–100", () => {
    expect(effectiveReorderThresholdPercent(70)).toBe(70);
    expect(effectiveReorderThresholdPercent(50)).toBe(50);
  });
});

describe("isBelowReorderThreshold", () => {
  it("true when stock/ROP % is below threshold", () => {
    // 60/100 = 60% < 70
    expect(isBelowReorderThreshold(60, 100, 70)).toBe(true);
  });

  it("false when at or above threshold", () => {
    expect(isBelowReorderThreshold(70, 100, 70)).toBe(false);
    expect(isBelowReorderThreshold(80, 100, 70)).toBe(false);
  });

  it("unevaluable when total ROP missing or zero", () => {
    expect(isBelowReorderThreshold(10, 0, 70)).toBe(false);
    expect(isBelowReorderThreshold(10, null, 70)).toBe(false);
  });

  it("uses default 70 when threshold unset", () => {
    expect(isBelowReorderThreshold(60, 100, null)).toBe(true);
    expect(isBelowReorderThreshold(75, 100, null)).toBe(false);
  });
});
