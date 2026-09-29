import { describe, expect, it } from "vitest";

import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import {
  applyShopifyPricesToCatalog,
  collectShopifyVariantPrices,
  parseShopifyMoney,
  pickShopifyStoreHandle,
} from "@/lib/osf/shopify-catalog-prices";

function row(partial: Partial<OsfCatalogRow> & Pick<OsfCatalogRow, "sku">): OsfCatalogRow {
  return {
    productTitle: partial.sku,
    brand: null,
    barcode: null,
    imageUrl: null,
    siteStatus: "active",
    itemStatusLabel: null,
    itemStatusCategory: "CONTINUE",
    erp1ProductPriority: "Top",
    erp2ProductPriority: "Top",
    erp1TaxStatus: null,
    erp2TaxStatus: null,
    country: null,
    mrp: 7850,
    discountedPrice: 7850,
    vendorId: null,
    ...partial,
  };
}

describe("parseShopifyMoney", () => {
  it("parses positive amounts", () => {
    expect(parseShopifyMoney("7065.00")).toBe(7065);
    expect(parseShopifyMoney(7850)).toBe(7850);
  });

  it("drops blank and non-positive", () => {
    expect(parseShopifyMoney(null)).toBeNull();
    expect(parseShopifyMoney("")).toBeNull();
    expect(parseShopifyMoney("0")).toBeNull();
  });
});

describe("pickShopifyStoreHandle", () => {
  it("prefers Cosmetics.lk location", () => {
    expect(
      pickShopifyStoreHandle([
        {
          shopifyAdminStoreHandle: "other-shop",
          name: "LWK",
          isMainCompany: true,
          locationReference: "LWK",
        },
        {
          shopifyAdminStoreHandle: "cosmetics-lk",
          name: "Cosmetics.lk",
          isMainCompany: false,
          locationReference: null,
        },
      ]),
    ).toBe("cosmetics-lk");
  });

  it("falls back to main company", () => {
    expect(
      pickShopifyStoreHandle([
        {
          shopifyAdminStoreHandle: "side-shop",
          name: "Outlet",
          isMainCompany: false,
          locationReference: null,
        },
        {
          shopifyAdminStoreHandle: "main-shop.myshopify.com",
          name: "HQ",
          isMainCompany: true,
          locationReference: null,
        },
      ]),
    ).toBe("main-shop");
  });
});

describe("collectShopifyVariantPrices", () => {
  it("keeps first SKU and ignores blanks", () => {
    const into = new Map();
    collectShopifyVariantPrices(
      [
        { sku: "ORD02_2", price: "7065.00", compareAtPrice: "7850.00" },
        { sku: "ord02_2", price: "1.00", compareAtPrice: null },
        { sku: "", price: "10.00", compareAtPrice: null },
      ],
      into,
    );
    expect(into.get("ORD02_2")).toEqual({ price: 7065, compareAtPrice: 7850 });
  });
});

describe("applyShopifyPricesToCatalog", () => {
  it("overlays Shopify sale onto Discounted Price and MRP", () => {
    const prices = new Map([
      ["ORD02_2", { price: 7065, compareAtPrice: 7850 }],
    ]);
    const [updated] = applyShopifyPricesToCatalog(
      [row({ sku: "ORD02_2", mrp: 7850, discountedPrice: 7850 })],
      prices,
    );
    expect(updated?.discountedPrice).toBe(7065);
    expect(updated?.mrp).toBe(7850);
  });

  it("clears MRP when Shopify has no compare-at", () => {
    const prices = new Map([["ORD02_2", { price: 7065, compareAtPrice: null }]]);
    const [updated] = applyShopifyPricesToCatalog([row({ sku: "ord02_2" })], prices);
    expect(updated?.discountedPrice).toBe(7065);
    expect(updated?.mrp).toBeNull();
  });

  it("leaves unmatched SKUs on Cosmo catalog prices", () => {
    const catalog = [row({ sku: "ORD02_1" })];
    expect(applyShopifyPricesToCatalog(catalog, new Map())).toBe(catalog);
    const [updated] = applyShopifyPricesToCatalog(
      catalog,
      new Map([["OTHER", { price: 1, compareAtPrice: 2 }]]),
    );
    expect(updated?.discountedPrice).toBe(7850);
    expect(updated?.mrp).toBe(7850);
  });
});
