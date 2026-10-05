import { describe, expect, it } from "vitest";

import { applyStandardSellingRatesToCatalog } from "@/lib/product-items/vault-catalog-price";

function item(sku: string, standardRate: number) {
  return { sku, standardRate };
}

describe("applyStandardSellingRatesToCatalog", () => {
  it("replaces stale Item.standard_rate with Standard Selling (BV001-1)", () => {
    const catalog = new Map([["BV001-1", item("BV001-1", 8500)]]);
    applyStandardSellingRatesToCatalog(catalog, new Map([["BV001-1", 6500]]), new Map([["BV001-1", 6500]]));
    expect(catalog.get("BV001-1")?.standardRate).toBe(6500);
  });

  it("lets ERP1 win when ERP2 has a different selling rate", () => {
    const catalog = new Map([["BV001-1", item("BV001-1", 8500)]]);
    applyStandardSellingRatesToCatalog(catalog, new Map([["BV001-1", 6500]]), new Map([["BV001-1", 7000]]));
    expect(catalog.get("BV001-1")?.standardRate).toBe(6500);
  });

  it("fills from ERP2 when ERP1 has no selling row", () => {
    const catalog = new Map([["AE009-1", item("AE009-1", 100)]]);
    applyStandardSellingRatesToCatalog(catalog, new Map(), new Map([["AE009-1", 4200]]));
    expect(catalog.get("AE009-1")?.standardRate).toBe(4200);
  });

  it("keeps Item.standard_rate when neither ERP has a selling row", () => {
    const catalog = new Map([["XX000-1", item("XX000-1", 1200)]]);
    applyStandardSellingRatesToCatalog(catalog, new Map(), new Map());
    expect(catalog.get("XX000-1")?.standardRate).toBe(1200);
  });

  it("matches SKU case-insensitively", () => {
    const catalog = new Map([["BV001-1", item("BV001-1", 8500)]]);
    applyStandardSellingRatesToCatalog(catalog, new Map([["bv001-1", 6500]]), new Map());
    expect(catalog.get("BV001-1")?.standardRate).toBe(6500);
  });
});
