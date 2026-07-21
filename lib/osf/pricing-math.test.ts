import { describe, expect, it } from "vitest";

import {
  formatPercentPoints,
  sellingFromMargin,
  sellingMargin,
  supplierPriceChangePercent,
} from "@/lib/osf/pricing-math";

describe("sellingMargin", () => {
  it("computes (sell − cost) / sell", () => {
    expect(sellingMargin(100, 40)).toBeCloseTo(0.6);
    expect(formatPercentPoints(sellingMargin(100, 40))).toBe(60);
  });

  it("blank when inputs missing or sell is 0", () => {
    expect(sellingMargin(null, 40)).toBeNull();
    expect(sellingMargin(100, null)).toBeNull();
    expect(sellingMargin(0, 40)).toBeNull();
  });
});

describe("sellingFromMargin", () => {
  it("inverts margin to selling price", () => {
    expect(sellingFromMargin(40, 0.6)).toBeCloseTo(100);
  });

  it("blank when margin ≥ 100% or cost missing", () => {
    expect(sellingFromMargin(40, 1)).toBeNull();
    expect(sellingFromMargin(40, 1.1)).toBeNull();
    expect(sellingFromMargin(null, 0.6)).toBeNull();
  });
});

describe("supplierPriceChangePercent", () => {
  it("computes (new − last) / last", () => {
    expect(supplierPriceChangePercent(100, 120)).toBeCloseTo(0.2);
    expect(formatPercentPoints(supplierPriceChangePercent(100, 120))).toBe(20);
  });

  it("shows decrease as negative", () => {
    expect(supplierPriceChangePercent(100, 80)).toBeCloseTo(-0.2);
  });

  it("blank when last missing or zero", () => {
    expect(supplierPriceChangePercent(null, 120)).toBeNull();
    expect(supplierPriceChangePercent(0, 120)).toBeNull();
  });
});
