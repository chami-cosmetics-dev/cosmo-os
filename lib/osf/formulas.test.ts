import { describe, expect, it } from "vitest";

import {
  cosmeticsMargin,
  ogfMargin,
  orderQty,
  percentOfRop,
  seventyPercentAvailabilityLabel,
  seventyPercentOfRop,
} from "@/lib/osf/formulas";

describe("orderQty", () => {
  it("returns ROP − stock when positive", () => {
    expect(orderQty(10, 3)).toBe(7);
  });

  it("floors at zero", () => {
    expect(orderQty(5, 8)).toBe(0);
  });

  it("treats missing stock as 0", () => {
    expect(orderQty(6, null)).toBe(6);
  });

  it("blank when ROP missing", () => {
    expect(orderQty(null, 5)).toBeNull();
  });
});

describe("percentOfRop / 70%", () => {
  it("computes stock/ROP", () => {
    expect(percentOfRop(5, 10)).toBe(0.5);
  });

  it("blank when ROP zero or missing", () => {
    expect(percentOfRop(5, 0)).toBeNull();
    expect(percentOfRop(5, null)).toBeNull();
  });

  it("70% threshold and label", () => {
    expect(seventyPercentOfRop(100)).toBe(70);
    expect(seventyPercentAvailabilityLabel(80, 100)).toBe("Above 70%");
    expect(seventyPercentAvailabilityLabel(60, 100)).toBe("Below 70%");
    expect(seventyPercentAvailabilityLabel(10, null)).toBeNull();
  });
});

describe("margins", () => {
  it("cosmetics margin (MRP − cost) / MRP", () => {
    expect(cosmeticsMargin(100, 40)).toBeCloseTo(0.6);
  });

  it("ogf margin independent of LWK", () => {
    expect(ogfMargin(200, 50)).toBeCloseTo(0.75);
  });

  it("blank when OGF or MRP missing", () => {
    expect(ogfMargin(null, 50)).toBeNull();
    expect(cosmeticsMargin(null, 50)).toBeNull();
    expect(ogfMargin(0, 50)).toBeNull();
  });
});
