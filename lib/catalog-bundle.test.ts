import { describe, expect, it } from "vitest";

import { isBundleCatalogItem } from "@/lib/catalog-bundle";
import { collectBundleSkus } from "@/lib/stock-price-missing/scan";

describe("isBundleCatalogItem", () => {
  it("matches bundle titles, types, and BU pack skus", () => {
    expect(isBundleCatalogItem({ sku: "BU006_1", productTitle: "COSRX Skin Glow Pack" })).toBe(true);
    expect(isBundleCatalogItem({ sku: "SV_BU001_1", productTitle: "Collagen" })).toBe(true);
    expect(isBundleCatalogItem({ sku: "CAN07_1", productTitle: "Vitamin C Bundle" })).toBe(true);
    expect(isBundleCatalogItem({ sku: "CAN07_1", productType: "Bundle" })).toBe(true);
    expect(isBundleCatalogItem({ sku: "CAN07_1", productTitle: "Cantu Shea Butter", productType: "Cream" })).toBe(
      false,
    );
  });
});

describe("collectBundleSkus", () => {
  it("keeps bundle skus out of the price mail set", () => {
    const out = collectBundleSkus(["BU006_1", "SV_BU001_1", "CAN07_1", "KIT_1"], {
      nameBySku: new Map([
        ["BU006_1", "COSRX Skin Glow Pack"],
        ["SV_BU001_1", "Collagen Bundle"],
        ["CAN07_1", "Cantu Shea Butter"],
        ["KIT_1", "Starter Kit"],
      ]),
      productTypeBySku: new Map([
        ["CAN07_1", "Cream"],
        ["KIT_1", "Bundles"],
      ]),
    });
    expect([...out].sort()).toEqual(["BU006_1", "KIT_1", "SV_BU001_1"]);
  });
});
