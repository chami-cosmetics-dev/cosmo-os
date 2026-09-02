import { describe, expect, it } from "vitest";

function quartile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx] ?? 0;
}

describe("outlet transfer quartiles", () => {
  it("identifies bottom and top quartile speeds", () => {
    const speeds = [0.1, 0.2, 0.5, 1.2, 3.0];
    expect(quartile(speeds, 0.25)).toBe(0.2);
    expect(quartile(speeds, 0.75)).toBe(1.2);
  });
});
