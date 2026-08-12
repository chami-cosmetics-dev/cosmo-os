import { describe, expect, it } from "vitest";

import {
  isNonProductInsightItem,
  rankInsightItemOptions,
} from "@/lib/customer-insight/filter-options";

describe("isNonProductInsightItem", () => {
  it("drops coupon / gift-card junk", () => {
    expect(
      isNonProductInsightItem({ title: "104523", sku: "coupon" })
    ).toBe(true);
    expect(
      isNonProductInsightItem({ title: "104523 · coupon" })
    ).toBe(true);
    expect(
      isNonProductInsightItem({ title: "116692", variant: "coupon" })
    ).toBe(true);
    expect(
      isNonProductInsightItem({
        title: "104523",
        variant: "Default Title",
        sku: "coupon",
      })
    ).toBe(true);
    expect(isNonProductInsightItem({ title: "104523", sku: "ABC" })).toBe(true);
  });

  it("keeps real catalog products", () => {
    expect(
      isNonProductInsightItem({
        title: "Acnes C10 Vitamin C Serum",
        variant: "20ml",
        sku: "ACN-C10",
      })
    ).toBe(false);
  });
});

describe("rankInsightItemOptions", () => {
  it("puts SKU prefix matches ahead of title substring matches", () => {
    const ranked = rankInsightItemOptions(
      [
        {
          value: "Cellucor C4 Original Pre-Workout",
          label: "Cellucor C4 Original Pre-Workout",
          sku: "CC008_1",
        },
        {
          value: "The Ordinary Niacinamide",
          label: "The Ordinary Niacinamide",
          sku: "TO01_1",
        },
        {
          value: "Order Pad",
          label: "Order Pad",
          sku: "PAD01",
        },
        {
          value: "Niacinamide Serum",
          label: "Niacinamide Serum",
          sku: "ORD01_1",
        },
        {
          value: "Borderline Serum",
          label: "Borderline Serum",
          sku: "XORD99",
        },
      ],
      "ord"
    );
    expect(ranked.map((i) => i.sku)).toEqual(["ORD01_1", "XORD99", "PAD01", "TO01_1"]);
  });
});
