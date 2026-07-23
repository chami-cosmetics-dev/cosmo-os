import { describe, expect, it } from "vitest";

import {
  cosmeticsMargin,
  ogfMargin,
  orderQty,
  originalSellingPrice,
  percentOfRop,
  seventyPercentAvailabilityLabel,
  seventyPercentOfRop,
  sumPositiveOrderQtys,
  sumSignedOrderQtysFlooredAtZero,
} from "@/lib/osf/formulas";

describe("orderQty", () => {
  it("returns ROP − stock when positive", () => {
    expect(orderQty(10, 3)).toBe(7);
  });

  it("allows negative when stock exceeds ROP", () => {
    expect(orderQty(5, 8)).toBe(-3);
  });

  it("treats missing stock as 0", () => {
    expect(orderQty(6, null)).toBe(6);
  });

  it("blank when ROP missing", () => {
    expect(orderQty(null, 5)).toBeNull();
  });
});

describe("sumPositiveOrderQtys", () => {
  it("sums only positive values", () => {
    expect(sumPositiveOrderQtys([10, 3, -15, null])).toBe(13);
  });
});

describe("sumSignedOrderQtysFlooredAtZero", () => {
  it("floors negative net at zero", () => {
    expect(sumSignedOrderQtysFlooredAtZero([10, 3, -15, null])).toBe(0);
  });

  it("keeps positive net including negatives", () => {
    expect(sumSignedOrderQtysFlooredAtZero([10, 3, -5])).toBe(8);
  });

  it("sums all-positive values", () => {
    expect(sumSignedOrderQtysFlooredAtZero([10, 3])).toBe(13);
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

describe("originalSellingPrice", () => {
  it("prefers MRP over discounted price", () => {
    expect(originalSellingPrice(100, 80)).toBe(100);
  });

  it("falls back to catalog sell when MRP missing", () => {
    expect(originalSellingPrice(null, 100)).toBe(100);
  });
});

describe("margins", () => {
  it("cosmetics margin (original sell − cost) / original sell", () => {
    expect(cosmeticsMargin(100, 40)).toBeCloseTo(0.6);
  });

  it("uses original not discounted when both exist", () => {
    const sell = originalSellingPrice(100, 80)!;
    expect(cosmeticsMargin(sell, 60)).toBeCloseTo(0.4);
    expect(cosmeticsMargin(80, 60)).toBeCloseTo(0.25);
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
