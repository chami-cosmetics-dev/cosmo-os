import { describe, expect, it } from "vitest";

import {
  childrenForCommonSku,
  commonSkuKeyFor,
  filterRowsByBrand,
  groupRowsByCommonSku,
  resolveCoverSkuFilter,
  skuMatchesSearch,
} from "@/lib/item-trends/sku-group";

describe("commonSkuKeyFor", () => {
  it("groups ORD04_1 under ORD04", () => {
    expect(commonSkuKeyFor({ sku: "ORD04_1" })).toBe("ORD04");
    expect(commonSkuKeyFor({ sku: "ORD04_2" })).toBe("ORD04");
  });

  it("uses Shopify product id when SKU has no numeric suffix", () => {
    expect(commonSkuKeyFor({ sku: "RED-1", shopifyProductId: "gid://shopify/Product/9" })).toBe(
      "gid://shopify/Product/9",
    );
  });

  it("falls back to SKU", () => {
    expect(commonSkuKeyFor({ sku: "RED-1", shopifyProductId: null })).toBe("RED-1");
  });
});

describe("groupRowsByCommonSku", () => {
  it("rolls variant units into one parent row", () => {
    const grouped = groupRowsByCommonSku([
      {
        sku: "A-RED",
        title: "Lipstick",
        commonSkuKey: "prod-1",
        commonSkuTitle: "Lipstick",
        unitsCurrent: 4,
        speedPerDay: 1,
      },
      {
        sku: "A-NUDE",
        title: "Lipstick",
        commonSkuKey: "prod-1",
        commonSkuTitle: "Lipstick",
        unitsCurrent: 6,
        speedPerDay: 1.5,
      },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.childCount).toBe(2);
    expect(grouped[0]?.unitsCurrent).toBe(10);
    expect(grouped[0]?.title).toBe("Lipstick");
  });
});

describe("filterRowsByBrand", () => {
  it("matches vendor name case-insensitively", () => {
    const rows = [
      { sku: "1", title: "a", brand: "CeraVe" },
      { sku: "2", title: "b", brand: "Other" },
    ];
    expect(filterRowsByBrand(rows, "cerave").map((r) => r.sku)).toEqual(["1"]);
  });
});

describe("childrenForCommonSku", () => {
  it("returns variants for a product key", () => {
    const rows = [
      { sku: "A", title: "t", commonSkuKey: "p1" },
      { sku: "B", title: "t", commonSkuKey: "p1" },
      { sku: "C", title: "t", commonSkuKey: "p2" },
    ];
    expect(childrenForCommonSku(rows, "p1").map((r) => r.sku)).toEqual(["A", "B"]);
  });
});

describe("skuMatchesSearch", () => {
  it("matches parent and numbered variants", () => {
    expect(skuMatchesSearch("ORD04_1", "ORD04", "ORD04")).toBe(true);
    expect(skuMatchesSearch("ORD04_2", "ORD04", "ord04_2")).toBe(true);
    expect(skuMatchesSearch("OTHER", "OTHER", "ORD04")).toBe(false);
  });
});

describe("resolveCoverSkuFilter", () => {
  const catalog = [
    { sku: "ORD04_1", commonSkuKey: "ORD04" },
    { sku: "ORD04_2", commonSkuKey: "ORD04" },
    { sku: "OTHER", commonSkuKey: "OTHER" },
  ];

  it("maps lowercase typed variant to catalog casing only", () => {
    expect(resolveCoverSkuFilter({ skuFilter: ["ord04_1"], catalog })).toEqual(["ORD04_1"]);
  });

  it("expands common parent to variants without raw query", () => {
    expect(resolveCoverSkuFilter({ skuFilter: ["ord04"], catalog })).toEqual([
      "ORD04_1",
      "ORD04_2",
    ]);
  });

  it("expands commonSkuKey without duplicating typed sku", () => {
    expect(
      resolveCoverSkuFilter({
        skuFilter: ["ord04_1"],
        commonSkuKey: "ORD04",
        catalog,
      }),
    ).toEqual(["ORD04_1", "ORD04_2"]);
  });

  it("returns empty when typed sku is not in catalog", () => {
    expect(resolveCoverSkuFilter({ skuFilter: ["ord04-1"], catalog })).toEqual([]);
  });
});
