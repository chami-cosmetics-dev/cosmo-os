import { describe, expect, it } from "vitest";

import {
  isCallQueuePushToGold,
  isCallQueuePushToPlatinum,
  matchesCallQueuePushBands,
} from "@/lib/customer-insight/call-queue-push";

describe("call-queue push bands (inclusive)", () => {
  it("Push to Gold includes 75k and 100k, excludes neighbors", () => {
    expect(isCallQueuePushToGold(74_999)).toBe(false);
    expect(isCallQueuePushToGold(75_000)).toBe(true);
    expect(isCallQueuePushToGold(100_000)).toBe(true);
    expect(isCallQueuePushToGold(100_001)).toBe(false);
  });

  it("Push to Platinum includes 200k and 250k, excludes neighbors", () => {
    expect(isCallQueuePushToPlatinum(199_999)).toBe(false);
    expect(isCallQueuePushToPlatinum(200_000)).toBe(true);
    expect(isCallQueuePushToPlatinum(250_000)).toBe(true);
    expect(isCallQueuePushToPlatinum(250_001)).toBe(false);
  });

  it("both chips are a union", () => {
    expect(matchesCallQueuePushBands(80_000, true, true)).toBe(true);
    expect(matchesCallQueuePushBands(220_000, true, true)).toBe(true);
    expect(matchesCallQueuePushBands(150_000, true, true)).toBe(false);
  });
});
