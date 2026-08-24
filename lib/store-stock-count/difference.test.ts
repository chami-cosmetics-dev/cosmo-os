import { describe, expect, it } from "vitest";

import { difference } from "@/lib/store-stock-count/difference";

describe("difference", () => {
  it("null when uncounted", () => {
    expect(difference(null, 10)).toBeNull();
  });

  it("null when stock unavailable", () => {
    expect(difference(5, null)).toBeNull();
  });

  it("count zero is counted", () => {
    expect(difference(0, 10)).toBe(-10);
  });

  it("normal over/short", () => {
    expect(difference(7, 10)).toBe(-3);
    expect(difference(12, 10)).toBe(2);
    expect(difference(10, 10)).toBe(0);
  });
});
