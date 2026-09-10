import { describe, expect, it } from "vitest";

import {
  allCountersSaved,
  displayManualCount,
} from "@/lib/store-stock-count/lanes";

describe("displayManualCount", () => {
  it("shows only my lane before combine", () => {
    expect(
      displayManualCount({
        combined: false,
        hasLanes: true,
        myQuantity: 18,
        combinedQuantity: 20,
        legacyCount: null,
      }),
    ).toBe(18);
  });

  it("hides a SKU the other user counted until combine", () => {
    expect(
      displayManualCount({
        combined: false,
        hasLanes: true,
        myQuantity: null,
        combinedQuantity: 2,
        legacyCount: null,
      }),
    ).toBeNull();
  });

  it("shows the summed count after both save", () => {
    expect(
      displayManualCount({
        combined: true,
        hasLanes: true,
        myQuantity: 18,
        combinedQuantity: 20,
        legacyCount: null,
      }),
    ).toBe(20);
  });
});

describe("allCountersSaved", () => {
  it("combines only after every counter saved", () => {
    expect(allCountersSaved(["u1", "u2"], ["u1"])).toBe(false);
    expect(allCountersSaved(["u1", "u2"], ["u1", "u2"])).toBe(true);
    expect(allCountersSaved([], ["u1"])).toBe(false);
  });
});
