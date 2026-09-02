import { describe, expect, it } from "vitest";

import { roundHalfUp } from "@/lib/osf/assist-window";

describe("ROP suggestion formula", () => {
  it("doubles window sales rounded half up", () => {
    expect(roundHalfUp(40 * 2)).toBe(80);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(2.4 * 2)).toBe(5);
  });
});
