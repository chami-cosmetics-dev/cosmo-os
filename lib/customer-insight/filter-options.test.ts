import { describe, expect, it } from "vitest";

import { isNonProductInsightItem } from "@/lib/customer-insight/filter-options";

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
      isNonProductInsightItem({ title: "Gift Card", productType: "Gift Card" })
    ).toBe(true);
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
