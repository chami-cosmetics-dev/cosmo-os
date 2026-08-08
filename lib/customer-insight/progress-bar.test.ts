import { describe, expect, it } from "vitest";

import {
  buildProgressBarDto,
  goldMilestoneRatio,
  progressBarFillRatio,
} from "@/lib/customer-insight/progress-bar";

describe("buildProgressBarDto", () => {
  it("amount to Gold when below 100k", () => {
    const bar = buildProgressBarDto(50_000);
    expect(bar.tier).toBe("standard");
    expect(bar.amountToNext).toBe(50_000);
    expect(bar.currentTotal).toBe(50_000);
  });

  it("amount to Platinum when gold", () => {
    const bar = buildProgressBarDto(100_000);
    expect(bar.tier).toBe("gold");
    expect(bar.amountToNext).toBe(150_000);
  });

  it("zero amountToNext at platinum", () => {
    const bar = buildProgressBarDto(250_000);
    expect(bar.tier).toBe("platinum");
    expect(bar.amountToNext).toBe(0);
  });
});

describe("progress ratios", () => {
  it("fill and gold milestone", () => {
    // 100k / 250k = 0.4
    expect(progressBarFillRatio(100_000)).toBeCloseTo(0.4);
    expect(goldMilestoneRatio()).toBeCloseTo(0.4);
  });
});
