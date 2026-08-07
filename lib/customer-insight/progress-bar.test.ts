import { describe, expect, it } from "vitest";

import {
  buildProgressBarDto,
  goldMilestoneRatio,
  progressBarFillRatio,
} from "@/lib/customer-insight/progress-bar";

describe("buildProgressBarDto", () => {
  it("amount to Gold when below 75k", () => {
    const bar = buildProgressBarDto(50_000);
    expect(bar.tier).toBe("standard");
    expect(bar.amountToNext).toBe(25_000);
    expect(bar.currentTotal).toBe(50_000);
  });

  it("amount to Platinum when gold", () => {
    const bar = buildProgressBarDto(100_000);
    expect(bar.tier).toBe("gold");
    expect(bar.amountToNext).toBe(100_000);
  });

  it("zero amountToNext at platinum", () => {
    const bar = buildProgressBarDto(200_000);
    expect(bar.tier).toBe("platinum");
    expect(bar.amountToNext).toBe(0);
  });
});

describe("progress ratios", () => {
  it("fill and gold milestone", () => {
    expect(progressBarFillRatio(100_000)).toBeCloseTo(0.5);
    expect(goldMilestoneRatio()).toBeCloseTo(0.375);
  });
});
