import { describe, expect, it } from "vitest";

import {
  classifyMovementSignal,
  classifyNewItemSignal,
  isSlowdown,
  MIN_FAST_MOVER_UNITS,
} from "@/lib/item-trends/signals";

describe("item-trends signals", () => {
  it("flags fast mover at min volume", () => {
    expect(classifyMovementSignal(MIN_FAST_MOVER_UNITS, MIN_FAST_MOVER_UNITS, "Top Priority")).toBe(
      "fast_mover",
    );
  });

  it("flags slowdown on Top Priority", () => {
    expect(isSlowdown(3, 10)).toBe(true);
    expect(classifyMovementSignal(3, 10, "Top Priority")).toBe("slowdown");
  });

  it("does not flag slowdown below baseline", () => {
    expect(isSlowdown(1, 3)).toBe(false);
  });

  it("classifies new item accelerating vs stalling", () => {
    expect(classifyNewItemSignal(5, 2)).toBe("accelerating");
    expect(classifyNewItemSignal(2, 8)).toBe("stalling");
  });
});
