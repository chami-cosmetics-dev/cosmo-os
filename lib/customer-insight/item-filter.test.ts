import { describe, expect, it } from "vitest";

import { lineMatchesBrand } from "@/lib/customer-insight/brand";
import { isOrderIncludedInCustomerLifetimeTotal } from "@/lib/customer-insight/lifetime-total";

/**
 * Mirrors the brand gate inside findContactsByPurchasedItemRanked when a brand
 * filter is also selected. Regression: vendor-null Relumins lines must still match.
 */
function itemLinePassesBrandGate(
  line: {
    productTitle?: string | null;
    vendorName?: string | null;
  },
  brandNeedles: string[]
): boolean {
  if (brandNeedles.length === 0) return true;
  return brandNeedles.some((brand) =>
    lineMatchesBrand(brand, {
      vendorName: line.vendorName,
      productTitle: line.productTitle,
    })
  );
}

describe("brand + item filter brand gate", () => {
  it("keeps Relumins SKU line when vendor is null but title has brand", () => {
    expect(
      itemLinePassesBrandGate(
        {
          vendorName: null,
          productTitle:
            "Relumins Advance White 1650mg Glutathione Complex 90 Capsules",
        },
        ["Relumins"]
      )
    ).toBe(true);
  });

  it("keeps line when vendor name is Relumins", () => {
    expect(
      itemLinePassesBrandGate(
        {
          vendorName: "Relumins",
          productTitle: "Advance White 1650mg Glutathione Complex 90 Capsules",
        },
        ["Relumins"]
      )
    ).toBe(true);
  });

  it("rejects unrelated title with null vendor", () => {
    expect(
      itemLinePassesBrandGate(
        {
          vendorName: null,
          productTitle: "NOW Vitamin C 500mg with Rose Hips 100 Tablets",
        },
        ["Relumins"]
      )
    ).toBe(false);
  });
});

describe("voided match spend rule", () => {
  it("excludes voided from lifetime spend but keeps completed", () => {
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: new Date(),
        financialStatus: "voided",
        fulfillmentStage: "ready_to_dispatch",
      })
    ).toBe(false);
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        financialStatus: "paid",
        fulfillmentStage: "invoice_complete",
      })
    ).toBe(true);
  });
});
