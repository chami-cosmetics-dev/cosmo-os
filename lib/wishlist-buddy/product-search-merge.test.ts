import { describe, expect, it } from "vitest";

import { mergeProductSearchHits } from "./product-search-merge";

const web = (sku: string, title: string) => ({
  sku,
  productTitle: title,
  variantTitle: "Default Title",
  imageUrl: `https://img/${sku}.jpg`,
  shopifyVariantId: `v-${sku}`,
  handle: title.toLowerCase().replace(/\s+/g, "-"),
});

describe("mergeProductSearchHits", () => {
  it("keeps one hit per SKU, preferring website data and flagging ERP presence", () => {
    const hits = mergeProductSearchHits(
      [web("ORD38_2", "Ordinary Serum")],
      [{ item_code: "ord38_2", item_name: "ORDINARY SERUM 30ML" }, { item_code: "ERP99_1", item_name: "Shop only cream" }],
      "ord",
    );
    expect(hits).toHaveLength(2);
    expect(hits.find((h) => h.sku === "ORD38_2")).toMatchObject({
      title: "Ordinary Serum",
      variantTitle: null,
      onWebsite: true,
      inErp: true,
      shopifyVariantId: "v-ORD38_2",
    });
    expect(hits.find((h) => h.sku === "ERP99_1")).toMatchObject({
      title: "Shop only cream",
      onWebsite: false,
      inErp: true,
      imageUrl: null,
    });
  });

  it("ranks exact SKU, then SKU prefix, then title matches", () => {
    const hits = mergeProductSearchHits(
      [web("XYZ1", "Contains ab in title"), web("AB12", "Prefix"), web("AB1", "Exact")],
      [],
      "AB1",
    );
    expect(hits.map((h) => h.sku)).toEqual(["AB1", "AB12", "XYZ1"]);
  });

  it("skips rows without a SKU and respects the limit", () => {
    const hits = mergeProductSearchHits(
      [{ ...web("A", "a"), sku: null }, web("B", "b"), web("C", "c")],
      [{ item_code: "", item_name: "x" }],
      "z",
      1,
    );
    expect(hits.map((h) => h.sku)).toEqual(["B"]);
  });
});
