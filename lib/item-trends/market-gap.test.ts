import { describe, expect, it } from "vitest";

import { resolveMarketGapBadge } from "./market-gap-badge";

describe("resolveMarketGapBadge", () => {
  it("prioritizes cheapest badge when isCheapest is true", () => {
    const badge = resolveMarketGapBadge(-12, true);
    expect(badge).toEqual({ label: "Cheapest", tone: "cheapest" });
  });

  it("returns above tone when gap is greater than 5%", () => {
    const badge = resolveMarketGapBadge(15.5, false);
    expect(badge).toEqual({ label: "+15.5%", tone: "above" });
  });

  it("returns below tone when gap is negative and not strictly cheapest", () => {
    const badge = resolveMarketGapBadge(-4.2, false);
    expect(badge).toEqual({ label: "-4.2%", tone: "below" });
  });

  it("returns neutral tone when gap is between 0 and 5%", () => {
    const badge = resolveMarketGapBadge(3.1, false);
    expect(badge).toEqual({ label: "+3.1%", tone: "neutral" });
  });

  it("returns null when gap is null or undefined", () => {
    expect(resolveMarketGapBadge(null, false)).toBeNull();
    expect(resolveMarketGapBadge(undefined, false)).toBeNull();
  });
});
