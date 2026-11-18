import { describe, expect, it } from "vitest";

import {
  buildOsfCatalogRowsFromItems,
  shopifySiteStatusRank,
  type OsfCatalogItemSource,
} from "@/lib/osf/catalog-row-build";

function item(
  partial: Partial<OsfCatalogItemSource> & Pick<OsfCatalogItemSource, "sku" | "productTitle">,
): OsfCatalogItemSource {
  return {
    barcode: null,
    imageUrl: null,
    status: "active",
    productType: "Cream",
    itemStatusCategory: "CONTINUE",
    itemStatusLabel: "Continue",
    erp1ProductPriority: "Continue",
    erp2ProductPriority: null,
    erp1TaxStatus: null,
    erp2TaxStatus: null,
    price: 100,
    compareAtPrice: null,
    vendorId: null,
    vendor: null,
    ...partial,
  };
}

describe("shopifySiteStatusRank", () => {
  it("ranks active above draft", () => {
    expect(shopifySiteStatusRank("active")).toBeGreaterThan(shopifySiteStatusRank("draft"));
    expect(shopifySiteStatusRank("ACTIVE")).toBe(shopifySiteStatusRank("active"));
  });
});

describe("buildOsfCatalogRowsFromItems", () => {
  it("drops BU pack skus and bundle titles", () => {
    const rows = buildOsfCatalogRowsFromItems([
      item({ sku: "BU029_1", productTitle: "Medicube TXA Brightening Skincare Set" }),
      item({ sku: "CAN07_1", productTitle: "Cantu Shea Butter Leave-In" }),
      item({ sku: "KIT_1", productTitle: "Glow Kit", productType: "Bundles" }),
    ]);
    expect(rows.map((r) => r.sku)).toEqual(["CAN07_1"]);
  });

  it("uses active Site Status when another row for the same SKU is still draft", () => {
    const rows = buildOsfCatalogRowsFromItems([
      item({
        sku: "LAR68_1",
        productTitle: "La Roche Posay Toleriane Dermo Cleanser 200ml",
        status: "draft",
      }),
      item({
        sku: "LAR68_1",
        productTitle: "La Roche Posay Toleriane Dermo Cleanser 200ml",
        status: "active",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.siteStatus).toBe("active");
  });
});
